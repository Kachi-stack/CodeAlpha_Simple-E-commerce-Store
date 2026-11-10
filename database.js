const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./store.db", (err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Kachi's Store database connected successfully!");
    }
});

db.run(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        image TEXT
    )
`);

db.run(`
    INSERT INTO products (name, price, description, image)
    SELECT 'Wireless Headphones', 35000, 'High-quality wireless headphones', 'headphones.jpg'
    WHERE NOT EXISTS (
        SELECT 1 FROM products WHERE name = 'Wireless Headphones'
    )
`);

db.run(`
    INSERT INTO products (name, price, description, image)
    SELECT 'Smartphone', 250000, 'Latest smartphone', 'smartphone.jpg'
    WHERE NOT EXISTS (
        SELECT 1 FROM products WHERE name = 'Smartphone'
    )
`);

db.run(`
    INSERT INTO products (name, price, description, image)
    SELECT 'Laptop', 650000, 'Powerful laptop for work and gaming', 'laptop.jpg'
    WHERE NOT EXISTS (
        SELECT 1 FROM products WHERE name = 'Laptop'
    )
`);

db.run(`
    INSERT INTO products (name, price, description, image)
    SELECT 'Smartwatch', 45000, 'Stylish smartwatch with health tracking', 'smartwatch.jpg'
    WHERE NOT EXISTS (
        SELECT 1 FROM products WHERE name = 'Smartwatch'
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        email TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        total REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
`);

db.run(
    "UPDATE products SET image = ? WHERE name = ?",
    ["Wireless headphones.jpg", "Wireless Headphones"]
);

db.all("PRAGMA table_info(products)", (err, columns) => {
    if (err) {
        console.error("Could not check products table:", err.message);
        return;
    }

    const stockColumnExists = columns.some(column => column.name === "stock");

    if (!stockColumnExists) {
        db.run(
            "ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 10",
            err => {
                if (err) {
                    console.error("Could not add stock column:", err.message);
                } else {
                    console.log("Product stock tracking is ready.");
                }
            }
        );
    }
});

db.all("PRAGMA table_info(orders)", (err, columns) => {
    if (err) {
        console.error("Could not check orders table:", err.message);
        return;
    }

    const columnNames = columns.map(column => column.name);

    if (!columnNames.includes("status")) {
        db.run(
            "ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'",
            err => {
                if (err) console.error("Could not add order status:", err.message);
            }
        );
    }

    if (!columnNames.includes("payment_reference")) {
        db.run(
            "ALTER TABLE orders ADD COLUMN payment_reference TEXT",
            err => {
                if (err) console.error("Could not add payment reference:", err.message);
            }
        );
    }

    if (!columnNames.includes("user_id")) {
        db.run(
            "ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id)",
            err => {
                if (err) console.error("Could not add order user ID:", err.message);
            }
        );
    }
});

module.exports = db;
