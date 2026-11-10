const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const loginView = document.getElementById("login-view");
const registerView = document.getElementById("register-view");
const accountForms = document.getElementById("auth-forms");
const signedInPanel = document.getElementById("signed-in-panel");
const accountMessage = document.getElementById("account-message");
const showLoginButton = document.getElementById("show-login");
const showRegisterButton = document.getElementById("show-register");

function showMessage(message, isError = false) {
    accountMessage.textContent = message;
    accountMessage.classList.toggle("error", isError);
}

function showAccount(user) {
    accountForms.hidden = true;
    signedInPanel.hidden = false;
    document.getElementById("account-name").textContent = user.name;
    document.getElementById("account-email").textContent = user.email;
    showMessage("Your account is ready.");
}

function selectForm(formName) {
    const showRegister = formName === "register";
    loginView.hidden = showRegister;
    registerView.hidden = !showRegister;
    document.getElementById("auth-heading").textContent = showRegister
        ? "Create your account"
        : "Sign in to your account";
    showMessage("");
}

async function submitAuthForm(url, form, successMessage) {
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "The request could not be completed.");
        }

        showAccount(result.user);
        showMessage(successMessage);
        form.reset();
    } catch (error) {
        showMessage(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
}

showLoginButton.addEventListener("click", () => selectForm("login"));
showRegisterButton.addEventListener("click", () => selectForm("register"));

loginForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAuthForm("/api/auth/login", loginForm, "You are signed in.");
});

registerForm.addEventListener("submit", event => {
    event.preventDefault();
    submitAuthForm("/api/auth/register", registerForm, "Your account has been created.");
});

document.getElementById("logout-button").addEventListener("click", async () => {
    try {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error("Could not sign out.");
        signedInPanel.hidden = true;
        accountForms.hidden = false;
        selectForm("login");
        showMessage("You have signed out.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

async function loadAccount() {
    try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
            const result = await response.json();
            showAccount(result.user);
        }
    } catch (error) {
        showMessage("Could not check your account. Please refresh the page.", true);
    }
}

loadAccount();
