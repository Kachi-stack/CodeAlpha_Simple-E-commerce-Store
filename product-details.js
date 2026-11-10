const productId = new URLSearchParams(window.location.search).get("id");
const productMessage = document.getElementById("product-message");
const detailCard = document.getElementById("product-detail");
let currentProduct = null;

function formatNaira(amount) {
    return `₦${Number(amount).toLocaleString("en-NG")}`;
}

async function loadProductDetails() {
    if (!productId || !/^\d+$/.test(productId)) {
        productMessage.textContent = "Choose a product from the shop to see its details.";
        return;
    }

    try {
        const response = await fetch(`/api/products/${encodeURIComponent(productId)}`);
        const product = await response.json();

        if (!response.ok) {
            throw new Error(product.error || "Product not found.");
        }

        currentProduct = product;
        document.title = `${product.name} | Kachi's Store`;
        const image = document.getElementById("detail-image");
        image.src = product.image.startsWith("images/")
            ? product.image
            : `images/${product.image}`;
        image.alt = product.name;
        document.getElementById("detail-name").textContent = product.name;
        document.getElementById("detail-price").textContent = formatNaira(product.price);
        document.getElementById("detail-description").textContent =
            product.description || "Contact the store for more product information.";
        document.getElementById("detail-stock").textContent = product.stock > 0
            ? `${product.stock} in stock`
            : "Out of stock";

        const addButton = document.getElementById("detail-add-button");
        addButton.disabled = product.stock < 1;
        if (product.stock < 1) addButton.textContent = "Out of stock";

        productMessage.hidden = true;
        detailCard.hidden = false;
    } catch (error) {
        productMessage.textContent = error.message;
    }
}

document.getElementById("detail-add-button").addEventListener("click", () => {
    if (!currentProduct) return;

    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find(item => Number(item.id) === currentProduct.id);

    if (existing && existing.quantity >= currentProduct.stock) {
        document.getElementById("cart-feedback").textContent =
            `Only ${currentProduct.stock} unit(s) are in stock.`;
        return;
    }

    if (existing) {
        existing.quantity++;
    } else {
        cart.push({
            id: currentProduct.id,
            name: currentProduct.name,
            price: currentProduct.price,
            stock: currentProduct.stock,
            quantity: 1
        });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    document.getElementById("cart-feedback").textContent =
        `${currentProduct.name} added to your cart.`;
});

loadProductDetails();
