require("dotenv").config();
const crypto = require("crypto");  
const express = require("express");
const db = require("./database");

const app = express();
app.use(express.static(__dirname));
app.use(express.json());

app.get("/api/products", (req, res) => {
    db.all(
        "SELECT id, name, price, description, image, stock FROM products",
        [],
        (err, products) => {
            if (err) {
                console.error("Error retrieving products:", err);
                return res.status(500).json({
                    error: "Could not retrieve products"
                });
            }

            res.json(products);
        }
    );
});

app.get("/api/products/:id", (req, res) => {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId < 1) {
        return res.status(400).json({ error: "Invalid product ID." });
    }

    db.get(
        "SELECT id, name, price, description, image, stock FROM products WHERE id = ?",
        [productId],
        (err, product) => {
            if (err) {
                console.error("Error retrieving product:", err);
                return res.status(500).json({ error: "Could not retrieve product." });
            }
            if (!product) return res.status(404).json({ error: "Product not found." });
            res.json(product);
        }
    );
});

function dbAll(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, values, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbGet(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, values, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbRun(sql, values = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, values, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({
                    lastID: this.lastID,
                    changes: this.changes
                });
            }
        });
    });
}

function parseSessionToken(req) {
    const cookies = (req.headers.cookie || "").split(";");
    const sessionCookie = cookies
        .map(cookie => cookie.trim())
        .find(cookie => cookie.startsWith("kachi_session="));
    return sessionCookie ? sessionCookie.slice("kachi_session=".length) : "";
}

function hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (err, key) => {
            if (err) reject(err);
            else resolve(key);
        });
    });
}

async function createPasswordHash(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = await hashPassword(password, salt);
    return `${salt}:${hash.toString("hex")}`;
}

async function passwordMatches(password, storedHash) {
    const [salt, savedHashHex] = String(storedHash || "").split(":");
    if (!salt || !savedHashHex) return false;

    const savedHash = Buffer.from(savedHashHex, "hex");
    const candidateHash = await hashPassword(password, salt);
    return savedHash.length === candidateHash.length &&
        crypto.timingSafeEqual(savedHash, candidateHash);
}

async function getAuthenticatedUser(req) {
    const token = parseSessionToken(req);
    if (!token) return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    return dbGet(
        `SELECT users.id, users.name, users.email
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
        [tokenHash, Math.floor(Date.now() / 1000)]
    );
}

async function startUserSession(userId, req, res) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

    await dbRun("DELETE FROM sessions WHERE expires_at <= ?", [Math.floor(Date.now() / 1000)]);
    await dbRun(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        [tokenHash, userId, expiresAt]
    );

    const secureFlag = req.secure ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `kachi_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secureFlag}`
    );
}

app.post("/api/auth/register", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
        return res.status(400).json({
            error: "Enter your name, a valid email, and a password between 8 and 128 characters."
        });
    }

    try {
        if (await dbGet("SELECT id FROM users WHERE email = ?", [email])) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        const passwordHash = await createPasswordHash(password);
        const result = await dbRun(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            [name, email, passwordHash]
        );
        const user = { id: result.lastID, name, email };

        await startUserSession(user.id, req, res);
        res.status(201).json({ user });
    } catch (err) {
        console.error("Account registration failed:", err.message);
        res.status(500).json({ error: "Could not create the account." });
    }
});

app.post("/api/auth/login", async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
        return res.status(400).json({ error: "Enter your email and password." });
    }

    try {
        const account = await dbGet(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            [email]
        );

        if (!account || !(await passwordMatches(password, account.password_hash))) {
            return res.status(401).json({ error: "Email or password is incorrect." });
        }

        const user = { id: account.id, name: account.name, email: account.email };
        await startUserSession(user.id, req, res);
        res.json({ user });
    } catch (err) {
        console.error("Login failed:", err.message);
        res.status(500).json({ error: "Could not sign in." });
    }
});

app.get("/api/auth/me", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ error: "Not signed in." });
        res.json({ user });
    } catch (err) {
        console.error("Could not load account:", err.message);
        res.status(500).json({ error: "Could not load account." });
    }
});

app.post("/api/auth/logout", async (req, res) => {
    try {
        const token = parseSessionToken(req);
        if (token) {
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            await dbRun("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
        }

        res.setHeader(
            "Set-Cookie",
            "kachi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Logout failed:", err.message);
        res.status(500).json({ error: "Could not sign out." });
    }
});

// Keep order transactions from overlapping.
let orderQueue = Promise.resolve();

app.post("/api/orders", async (req, res) => {
    const { customerName, email, deliveryAddress, items } = req.body || {};

    if (
        !customerName?.trim() ||
        !email?.trim() ||
        !deliveryAddress?.trim() ||
        !Array.isArray(items) ||
        items.length === 0
    ) {
        return res.status(400).json({
            error: "Please provide your details and cart items."
        });
    }

    const validItems = items.every(item =>
        Number.isInteger(Number(item.id)) &&
        Number(item.id) > 0 &&
        Number.isInteger(Number(item.quantity)) &&
        Number(item.quantity) > 0
    );

    if (!validItems) {
        return res.status(400).json({
            error: "The cart contains invalid products or quantities."
        });
    }

    try {
        const authenticatedUser = await getAuthenticatedUser(req);
        const ids = items.map(item => Number(item.id));

        if (new Set(ids).size !== ids.length) {
            return res.status(400).json({
                error: "The cart contains duplicate products."
            });
        }

        const placeholders = ids.map(() => "?").join(",");
        const products = await dbAll(
            `SELECT id, price, stock FROM products WHERE id IN (${placeholders})`,
            ids
        );

        if (products.length !== items.length) {
            return res.status(400).json({
                error: "A product in your cart could not be found."
            });
        }

        const productById = new Map(
            products.map(product => [product.id, product])
        );

        const exceedsStock = items.some(item => {
            const product = productById.get(Number(item.id));
            return Number(item.quantity) > product.stock;
        });

        if (exceedsStock) {
            return res.status(409).json({
                error: "Not enough stock for one or more products."
            });
        }

        const orderItems = items.map(item => ({
            id: Number(item.id),
            quantity: Number(item.quantity),
            price: productById.get(Number(item.id)).price
        }));

        const total = orderItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        const saveOrder = async () => {
            await dbRun("BEGIN TRANSACTION");

            try {
                const result = await dbRun(
                    `INSERT INTO orders (user_id, customer_name, email, delivery_address, total)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        authenticatedUser?.id || null,
                        customerName.trim(),
                        email.trim(),
                        deliveryAddress.trim(),
                        total
                    ]
                );

                for (const item of orderItems) {
                    const stockUpdate = await dbRun(
                        `UPDATE products
                         SET stock = stock - ?
                         WHERE id = ? AND stock >= ?`,
                        [item.quantity, item.id, item.quantity]
                    );

                    if (stockUpdate.changes !== 1) {
                        const error = new Error(
                            "Not enough stock for one or more products."
                        );
                        error.statusCode = 409;
                        throw error;
                    }

                    await dbRun(
                        `INSERT INTO order_items
                         (order_id, product_id, quantity, unit_price)
                         VALUES (?, ?, ?, ?)`,
                        [result.lastID, item.id, item.quantity, item.price]
                    );
                }

                await dbRun("COMMIT");
                return { orderId: result.lastID, total };
            } catch (error) {
                try {
                    await dbRun("ROLLBACK");
                } catch (rollbackError) {
                    console.error("Could not roll back order:", rollbackError);
                }

                throw error;
            }
        };

        const orderResult = orderQueue.then(saveOrder, saveOrder);
        orderQueue = orderResult.then(
            () => undefined,
            () => undefined
        );

        const savedOrder = await orderResult;
        res.status(201).json(savedOrder);
    } catch (err) {
        if (err.statusCode === 409) {
            return res.status(409).json({ error: err.message });
        }

        console.error("Error saving order:", err);
        res.status(500).json({
            error: "Could not save the order."
        });
    }
});

app.post("/api/payments/initialize", async (req, res) => {
    const orderId = Number(req.body?.orderId);

    if (!Number.isInteger(orderId) || orderId < 1) {
        return res.status(400).json({ error: "Invalid order ID." });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(500).json({ error: "Paystack key is not configured." });
    }

    try {
        const order = await dbGet(
            "SELECT id, email, total, status FROM orders WHERE id = ?",
            [orderId]
        );

        if (!order) {
            return res.status(404).json({ error: "Order not found." });
        }

        if (order.status !== "Pending") {
            return res.status(409).json({ error: "This order is not pending payment." });
        }

        const reference = `kachi-order-${order.id}-${crypto.randomUUID()}`;

        const paystackResponse = await fetch(
            "https://api.paystack.co/transaction/initialize",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: order.email,
                    amount: Math.round(order.total * 100),
                    currency: "NGN",
                    reference,
                    callback_url: `${req.protocol}://${req.get("host")}/api/payments/callback`,
                    metadata: { orderId: order.id }
                })
            }
        );

        const result = await paystackResponse.json();

        if (!paystackResponse.ok || !result.status) {
            console.error("Paystack initialization failed:", result.message);
            return res.status(502).json({ error: "Could not start payment." });
        }

        await dbRun(
            "UPDATE orders SET payment_reference = ? WHERE id = ?",
            [reference, order.id]
        );

        res.json({ authorizationUrl: result.data.authorization_url });
    } catch (err) {
        console.error("Error starting payment:", err.message);
        res.status(500).json({ error: "Could not start payment." });
    }
});

app.get("/api/payments/callback", async (req, res) => {
    const reference = String(req.query.reference || "");

    if (!reference) {
        return res.status(400).send("Payment reference is missing.");
    }

    try {
        const order = await dbGet(
            "SELECT id, total, status, payment_reference FROM orders WHERE payment_reference = ?",
            [reference]
        );

        if (!order) {
            return res.status(404).send("Order not found.");
        }

        const paystackResponse = await fetch(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
                }
            }
        );

        const result = await paystackResponse.json();

        if (!paystackResponse.ok || !result.status) {
            return res.status(502).send("Could not verify payment with Paystack.");
        }

        const payment = result.data;
        const expectedAmount = Math.round(order.total * 100);

        if (
            payment.status !== "success" ||
            payment.amount !== expectedAmount ||
            payment.currency !== "NGN" ||
            payment.reference !== reference
        ) {
            return res.status(400).send("Payment is not confirmed. The order is still pending.");
        }

        await dbRun(
            "UPDATE orders SET status = 'Paid' WHERE id = ? AND payment_reference = ? AND status = 'Pending'",
            [order.id, reference]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Payment confirmed</title></head>
            <body>
                <h1>Payment confirmed</h1>
                <p>Order ORD-${order.id} is paid.</p>
                <p>Total: ₦${order.total.toLocaleString("en-NG")}</p>
                <a href="/">Return to the store</a>
                <script>localStorage.removeItem("cart");</script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("Payment verification failed:", err.message);
        res.status(500).send("Could not verify payment.");
    }
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Kachi's Store server is running on port ${PORT}`);
});
