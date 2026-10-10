const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusText = document.getElementById("status");
const usersList = document.getElementById("users-list");

let users = [];


// Fetch the people from the API
async function loadUsers() {
    loadButton.disabled = true;
    statusText.textContent = "Finding people...";
    usersList.replaceChildren();

    try {
        const response = await fetch(
            "https://jsonplaceholder.typicode.com/users"
        );

        if (!response.ok) {
            throw new Error("The user request failed.");
        }

        users = await response.json();
        renderUsers(users);

        statusText.textContent =
            `Your directory has ${users.length} people.`;

    } catch (error) {
        users = [];
        usersList.replaceChildren();

        statusText.textContent =
            "We couldn't load the directory. Please try again.";

        console.error("Loading error:", error);

    } finally {
        loadButton.disabled = false;
    }
}


// Build a card for each person in the supplied list
function renderUsers(list) {
    usersList.replaceChildren();

    list.forEach(function (user) {
        const card = document.createElement("li");
        const name = document.createElement("h2");
        const email = document.createElement("p");
        const city = document.createElement("p");
        const company = document.createElement("p");

        name.textContent = user.name;
        email.textContent = `Email: ${user.email}`;
        city.textContent = `Based in: ${user.address.city}`;
        company.textContent = `Works at: ${user.company.name}`;

        card.appendChild(name);
        card.appendChild(email);
        card.appendChild(city);
        card.appendChild(company);

        usersList.appendChild(card);
    });
}


// Get the directory when the button is clicked
loadButton.addEventListener("click", loadUsers);


// Search the stored list without fetching again
filterInput.addEventListener("input", function () {
    const search = filterInput.value.trim().toLowerCase();

    const matches = users.filter(function (user) {
        return user.name.toLowerCase().includes(search);
    });

    renderUsers(matches);

    if (users.length === 0) {
        statusText.textContent =
            "Load the directory before searching.";
    } else if (matches.length === 0) {
        statusText.textContent = "No users match your filter.";
    } else {
        statusText.textContent =
            `Found ${matches.length} matching people.`;
    }
});