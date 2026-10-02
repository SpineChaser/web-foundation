
let notes = [
    { id: 1, text: "Buy milk and bread", category: "personal" },
    { id: 2, text: "Finish the Day 3 assignment", category: "study" },
    { id: 3, text: "Email the project report to Grace", category: "work" },
    { id: 4, text: "Revise JavaScript arrays", category: "study" },
    { id: 5, text: "Call mum", category: "personal" },
];

// 1. Find notes that contain a particular word
function searchNotes(word) {
    return notes.filter(function(note) {
        return note.text.toLowerCase().includes(word.toLowerCase());
    });
}

console.log("Searching for arrays:", searchNotes("arrays"));
// Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]

console.log("Searching for homework:", searchNotes("homework"));
// Expected: []


// 2. Find the note with the most characters
function longestNote() {
    if (notes.length === 0) {
        return null;
    }

    let longest = notes[0];

    for (let i = 1; i < notes.length; i++) {
        if (notes[i].text.length > longest.text.length) {
            longest = notes[i];
        }
    }

    return longest;
}

console.log("My longest note:", longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

let originalNotes = notes;
notes = [];

console.log("Longest note when there are no notes:", longestNote());
// Expected: null

notes = originalNotes;


// 3. Count how many notes belong to each category
function countByCategory() {
    let totals = {
        personal: 0,
        work: 0,
        study: 0
    };

    for (let i = 0; i < notes.length; i++) {
        let category = notes[i].category;
        totals[category]++;
    }

    return totals;
}

console.log("My category totals:", countByCategory());
// Expected: { personal: 2, work: 1, study: 2 }

originalNotes = notes;
notes = [];

console.log("Category totals for an empty list:", countByCategory());
// Expected: { personal: 0, work: 0, study: 0 }

notes = originalNotes;


// 4. Display a sentence summarising the notes
function getSummary() {
    let totals = countByCategory();
    let amount = notes.length;
    let label = amount === 1 ? "note" : "notes";

    return `${amount} ${label}: ${totals.personal} personal, ${totals.work} work, ${totals.study} study.`;
}

console.log("My notes summary:", getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

originalNotes = notes;
notes = [{ id: 1, text: "Read a book", category: "personal" }];

console.log("Summary with one note:", getSummary());
// Expected: "1 note: 1 personal, 0 work, 0 study."

notes = originalNotes;


// 5. Check whether a note already exists
function isDuplicate(text) {
    let searchText = text.trim().toLowerCase();

    return notes.some(function(note) {
        return note.text.trim().toLowerCase() === searchText;
    });
}

console.log("Is 'Call mum' already saved?", isDuplicate("Call mum"));
// Expected: true

console.log("Is 'Visit the library' already saved?", isDuplicate("Visit the library"));
// Expected: false

console.log("Does different capitalisation count as a duplicate?", isDuplicate("  CALL MUM  "));
// Expected: true


// 6. Add a new note after checking its details
function addNote(text, category) {
    if (typeof text !== "string" || text.trim().length < 1 || text.trim().length > 200) {
        console.log("Cannot add note: enter between 1 and 200 characters.");
        return false;
    }

    if (category !== "personal" && category !== "work" && category !== "study") {
        console.log("Cannot add note: choose personal, work or study.");
        return false;
    }

    if (isDuplicate(text)) {
        console.log("Cannot add note: this note already exists.");
        return false;
    }

    let highestId = 0;

    for (let i = 0; i < notes.length; i++) {
        if (notes[i].id > highestId) {
            highestId = notes[i].id;
        }
    }

    notes.push({
        id: highestId + 1,
        text: text.trim(),
        category: category
    });

    console.log("Your note has been saved.");
    return true;
}

console.log("Adding a new work note:", addNote("Prepare for Monday meeting", "work"));
// Expected: true

console.log("Trying to add the same note again:", addNote(" prepare for monday meeting ", "work"));
// Expected: false

console.log("Trying to save an empty note:", addNote("   ", "personal"));
// Expected: false

console.log("Trying an unrecognised category:", addNote("Learn HTML forms", "school"));
// Expected: false

console.log("Trying a note that is too long:", addNote("x".repeat(201), "study"));
// Expected: false

console.log("All notes after testing:", notes);
// Expected: 6 notes in total

console.log("Updated summary:", getSummary());
// Expected: "6 notes: 2 personal, 2 work, 2 study."