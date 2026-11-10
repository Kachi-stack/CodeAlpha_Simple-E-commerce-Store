// Load the saved cart from the browser.
let cart = JSON.parse(localStorage.getItem("cart")) || [];

function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
}

// Page elements
const productContainer = document.getElementById("product-container");
const cartCount = document.getElementById("cart-count");
const cartTotal = document.getElementById("cart-total");
const cartItems = document.getElementById("cart-items");
const clearCartButton = document.getElementById("clear-cart");
const checkoutButton = document.getElementById("checkout-button");
const checkoutSection = document.getElementById("checkout-section");
const orderSummary = document.getElementById("order-summary");
const orderTotal = document.getElementById("order-total");
const checkoutForm = document.getElementById("checkout-form");
const orderConfirmation = document.getElementById("order-confirmation");
const searchInput = document.querySelector(".search-cart input");
const searchForm = document.getElementById("product-search");
const noProductsMessage = document.getElementById("no-products-message");

function updateCartCount() {
    const totalCount = cart.reduce((total, item) => total + item.quantity, 0);
    cartCount.textContent = totalCount;
}

function renderCart() {
    saveCart();
    updateCartCount();

    const total = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    cartTotal.textContent = `₦${total.toLocaleString("en-NG")}`;

    cartItems.innerHTML = "";

    if (cart.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "Your cart is empty.";
        cartItems.appendChild(emptyMessage);
        return;
    }

    cart.forEach(item => {
        const itemElement = document.createElement("div");

        const productName = document.createElement("span");
        productName.textContent =
            `${item.name} - ₦${item.price.toLocaleString("en-NG")} `;

        const decreaseButton = document.createElement("button");
        decreaseButton.textContent = "-";
        decreaseButton.addEventListener("click", () => {
            if (item.quantity > 1) {
                item.quantity--;
            } else {
                cart = cart.filter(cartItem => cartItem !== item);
            }

            renderCart();
        });

        const quantityDisplay = document.createElement("span");
        quantityDisplay.textContent = item.quantity;

        const increaseButton = document.createElement("button");
        increaseButton.textContent = "+";
        increaseButton.addEventListener("click", () => {
            if (item.quantity >= item.stock) {
                alert(`Only ${item.stock} unit(s) of ${item.name} are in stock.`);
                return;
            }

            item.quantity++;
            renderCart();
        });

        itemElement.append(
            productName,
            decreaseButton,
            quantityDisplay,
            increaseButton
        );

        cartItems.appendChild(itemElement);
    });
}

async function loadProducts() {
    try {
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error("Products could not be loaded.");
        }

        const products = await response.json();
        productContainer.innerHTML = "";

        // Refresh saved cart items with current database details.
        cart = cart
            .map(item => {
                const product = products.find(
                    product =>
                        product.id === Number(item.id) ||
                        product.name === item.name
                );

                if (!product) return null;

                return {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    stock: product.stock,
                    quantity: item.quantity
                };
            })
            .filter(item => item !== null);

        renderCart();

        products.forEach(product => {
            const card = document.createElement("div");
            card.className = "product-card";
            const nameForCategory = product.name.toLowerCase();
            card.dataset.category = nameForCategory.includes("headphone")
                ? "audio"
                : nameForCategory.includes("watch")
                    ? "wearables"
                    : "phones-computers";

            const image = document.createElement("img");
            image.src = product.image.startsWith("images/")
                ? product.image
                : `images/${product.image}`;
            image.alt = product.name;

            const name = document.createElement("h3");
            name.textContent = product.name;

            const detailsLink = document.createElement("a");
            detailsLink.className = "product-details-link";
            detailsLink.href = `product.html?id=${encodeURIComponent(product.id)}`;
            detailsLink.textContent = "View details";

            const price = document.createElement("p");
            price.textContent =
                `₦${product.price.toLocaleString("en-NG")}`;

            const stock = document.createElement("p");
            stock.textContent = product.stock > 0
                ? `${product.stock} in stock`
                : "Out of stock";

            const addButton = document.createElement("button");
            addButton.className = "add-to-cart";
            addButton.textContent = "Add to Cart";
            addButton.disabled = product.stock === 0;
            addButton.dataset.id = product.id;
            addButton.dataset.name = product.name;
            addButton.dataset.price = product.price;
            addButton.dataset.stock = product.stock;

            if (product.stock === 0) {
                addButton.textContent = "Out of stock";
            }

            card.append(image, name, price, stock, detailsLink, addButton);
            productContainer.appendChild(card);
        });

        filterProducts();
    } catch (error) {
        console.error("Error loading products:", error);
        productContainer.textContent =
            "Products couldn't be loaded. Please try again.";
    }
}

productContainer.addEventListener("click", event => {
    const button = event.target.closest(".add-to-cart");

    if (!button) return;

    const id = Number(button.dataset.id);
    const name = button.dataset.name;
    const price = Number(button.dataset.price);
    const stock = Number(button.dataset.stock);
    const existingProduct = cart.find(item => item.id === id);

    if (existingProduct && existingProduct.quantity >= stock) {
        alert(`Only ${stock} unit(s) of ${name} are in stock.`);
        return;
    }

    if (existingProduct) {
        existingProduct.quantity++;
    } else {
        cart.push({ id, name, price, stock, quantity: 1 });
    }

    renderCart();
});

clearCartButton.addEventListener("click", () => {
    cart = [];
    renderCart();

    checkoutSection.hidden = true;
    checkoutForm.hidden = false;
    orderConfirmation.hidden = true;
});

// Create the order, then send the customer to Paystack checkout.
checkoutForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton = checkoutForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const orderResponse = await fetch("/api/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                customerName: document.getElementById("customer-name").value,
                email: document.getElementById("customer-email").value,
                deliveryAddress: document.getElementById("delivery-address").value,
                items: cart.map(item => ({
                    id: item.id,
                    quantity: item.quantity
                }))
            })
        });

        const order = await orderResponse.json();

        if (!orderResponse.ok) {
            throw new Error(order.error || "Could not create the order.");
        }

        const paymentResponse = await fetch("/api/payments/initialize", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ orderId: order.orderId })
        });

        const payment = await paymentResponse.json();

        if (!paymentResponse.ok) {
            throw new Error(payment.error || "Could not start payment.");
        }

        window.location.href = payment.authorizationUrl;
    } catch (error) {
        alert(error.message);
        submitButton.disabled = false;
    }
});

checkoutButton.addEventListener("click", () => {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }

    checkoutSection.hidden = false;
    checkoutForm.hidden = false;
    orderConfirmation.hidden = true;
    orderSummary.innerHTML = "";

    cart.forEach(item => {
        const orderItem = document.createElement("p");
        orderItem.textContent =
            `${item.name} - ₦${item.price.toLocaleString("en-NG")} x ${item.quantity}`;
        orderSummary.appendChild(orderItem);
    });

    const total = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    orderTotal.textContent = `₦${total.toLocaleString("en-NG")}`;
});

function filterProducts() {
    const normalizeSearchText = text => text
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .map(word => {
            if (word.endsWith("ies") && word.length > 4) {
                return `${word.slice(0, -3)}y`;
            }

            if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) {
                return word.slice(0, -1);
            }

            return word;
        })
        .join(" ");

    const searchText = normalizeSearchText(searchInput.value);
    const selectedCategory = document.querySelector("[data-category-filter].active")?.dataset.categoryFilter || "all";
    let visibleProductCount = 0;

    document
        .querySelectorAll("#product-container .product-card")
        .forEach(card => {
            const productName = normalizeSearchText(
                card.querySelector("h3").textContent
            );
            const matchesSearch = productName.includes(searchText);
            const matchesCategory = selectedCategory === "all" ||
                card.dataset.category === selectedCategory;
            card.hidden = !(matchesSearch && matchesCategory);
            if (!card.hidden) visibleProductCount++;
        });

    noProductsMessage.hidden = visibleProductCount > 0;
}

document.querySelectorAll("[data-category-filter]").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelector("[data-category-filter].active")?.classList.remove("active");
        link.classList.add("active");
        filterProducts();
    });
});

searchInput.addEventListener("input", filterProducts);
searchForm.addEventListener("submit", event => {
    event.preventDefault();
    filterProducts();
    document.getElementById("products").scrollIntoView({ behavior: "smooth" });
});

// Show the cart immediately, then load products from the API.
renderCart();
loadProducts();
