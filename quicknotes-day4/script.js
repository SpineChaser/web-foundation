const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

const limit = 200;


// Update the character and word counters
function updateCounts() {
    const text = noteText.value;
    const numberOfCharacters = text.length;

    charCount.textContent =
        `${numberOfCharacters} / ${limit} characters`;

    if (text.trim() === "") {
        wordCount.textContent = "0 words";
    } else {
        const words = text.trim().split(/\s+/);
        wordCount.textContent = `${words.length} words`;
    }

    charCount.classList.remove("warning", "over");

    if (numberOfCharacters > 200) {
        charCount.classList.add("over");
    } else if (numberOfCharacters > 180) {
        charCount.classList.add("warning");
    }
}


// Save the current text
function saveDraft() {
    localStorage.setItem("quickNotesDraft", noteText.value);
}


// Clear the note and saved draft
function clearNote() {
    noteText.value = "";
    localStorage.removeItem("quickNotesDraft");
    updateCounts();
}


// Change the button text depending on the current theme
function updateThemeButton() {
    if (document.body.classList.contains("dark")) {
        themeToggle.textContent = "Light mode";
    } else {
        themeToggle.textContent = "Dark mode";
    }
}


// Save the draft whenever the user types
noteText.addEventListener("input", function () {
    updateCounts();
    saveDraft();
});


// Clear button
clearBtn.addEventListener("click", function () {
    clearNote();
});


// Escape key clears the note
noteText.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        clearNote();
    }
});


// Dark/light mode
themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark");

    if (document.body.classList.contains("dark")) {
        localStorage.setItem("quickNotesTheme", "dark");
    } else {
        localStorage.setItem("quickNotesTheme", "light");
    }

    updateThemeButton();
});


// Restore the saved draft
const savedDraft = localStorage.getItem("quickNotesDraft");

if (savedDraft !== null) {
    noteText.value = savedDraft;
}


// Restore the saved theme
const savedTheme = localStorage.getItem("quickNotesTheme");

if (savedTheme === "dark") {
    document.body.classList.add("dark");
}


// Set the page up when it first loads
updateThemeButton();
updateCounts();