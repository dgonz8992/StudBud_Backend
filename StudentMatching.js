// Configuration
const studentsTableName = "Students";
const matchesTableName = "Student Matches";

const scoreFields = [
    "University : Score",
    "Degree : Score",
    "Learning Habits : Score",
    "Struggling Concepts : Score",
    "Career Trajectories : Score",
    "Meet-up Distance : Score",
    "Meet-up Mode : Score"
];

const preferenceRules = [
    {
        label: "University",
        valueField: "University",
        weightField: "University : Weight"
    },
    {
        label: "Degree",
        valueField: "Degree",
        weightField: "Degree : Weight"
    },
    {
        label: "Learning Habits",
        valueField: "Learning Habits",
        weightField: "Learning Habits : Weight"
    },
    {
        label: "Struggling Concepts",
        valueField: "Struggling Concepts",
        weightField: "Struggling Concepts : Weight"
    },
    {
        label: "Career Goals",
        valueField: "Career Goals",
        weightField: "Career Trajectories : Weight"
    },
    {
        label: "Meet-up Distance",
        valueField: "Meet-up Distance",
        weightField: "Meet-up Distance : Weight"
    },
    {
        label: "Meet-up Mode",
        valueField: "Meet-up Mode",
        weightField: "Meet-up Mode : Weight"
    }
];

// Minimum score to save
const minimumMatchScore = 70;

// Penalties for mismatched values when both students care
const mismatchPenaltyByWeight = {
    3: 35, // very important
    2: 15, // moderately important
    1: 5   // slightly important
};

// Tables
const studentsTable = base.getTable(studentsTableName);
const matchesTable = base.getTable(matchesTableName);

// Clear existing matches
const existingMatches = await matchesTable.selectRecordsAsync();
let idsToDelete = existingMatches.records.map(record => record.id);

output.markdown(`## Clearing ${idsToDelete.length} old matches...`);

while (idsToDelete.length > 0) {
    await matchesTable.deleteRecordsAsync(idsToDelete.slice(0, 50));
    idsToDelete = idsToDelete.slice(50);
}

output.markdown(`## Old matches cleared`);

// Fetch students
const studentsQuery = await studentsTable.selectRecordsAsync({
    fields: [
        "Name",
        ...scoreFields,
        ...preferenceRules.flatMap(rule => [rule.valueField, rule.weightField])
    ]
});

const students = studentsQuery.records;

output.markdown(`## Found ${students.length} students`);

function normalizeValue(value) {
    if (value === null || value === undefined) return "";

    if (Array.isArray(value)) {
        return value
            .map(item => {
                if (typeof item === "object" && item !== null) {
                    if (item.name) return item.name.trim().toLowerCase();
                    return JSON.stringify(item).trim().toLowerCase();
                }
                return String(item).trim().toLowerCase();
            })
            .sort()
            .join(", ");
    }

    if (typeof value === "object" && value !== null) {
        if (value.name) return value.name.trim().toLowerCase();
        return JSON.stringify(value).trim().toLowerCase();
    }

    return String(value).trim().toLowerCase();
}

function getNumericValue(record, fieldName) {
    const value = record.getCellValue(fieldName);
    return typeof value === "number" ? value : 0;
}

function calculatePreferencePenalty(studentA, studentB) {
    let totalPenalty = 0;
    let penaltyReasons = [];

    for (const rule of preferenceRules) {
        const weightA = getNumericValue(studentA, rule.weightField);
        const weightB = getNumericValue(studentB, rule.weightField);

        const minWeight = Math.min(weightA, weightB);

        if (minWeight <= 0) {
            continue;
        }

        const valueA = normalizeValue(studentA.getCellValue(rule.valueField));
        const valueB = normalizeValue(studentB.getCellValue(rule.valueField));

        // Don't penalize if one side is blank
        if (valueA === "" || valueB === "") {
            continue;
        }

        const valuesMatch = valueA === valueB;

        if (!valuesMatch) {
            const penalty = mismatchPenaltyByWeight[minWeight] || 0;
            totalPenalty += penalty;

            penaltyReasons.push(
                `${rule.label} mismatch (weights ${weightA}/${weightB}, penalty ${penalty})`
            );
        }
    }

    return {
        totalPenalty,
        penaltyReasons
    };
}

// Similarity function
function calculateSimilarity(studentA, studentB) {
    let totalDifference = 0;
    let validFields = 0;

    let matchedCategories = [];
    let scoresA = {};
    let scoresB = {};
    let differences = {};

    for (const field of scoreFields) {
        const scoreA = getNumericValue(studentA, field);
        const scoreB = getNumericValue(studentB, field);

        scoresA[field] = scoreA;
        scoresB[field] = scoreB;

        const diff = Math.abs(scoreA - scoreB);
        differences[field] = diff;

        // Since scores appear to be 0-100, treat within 10 points as similar
        if (diff <= 10 && (scoreA > 0 || scoreB > 0)) {
            const categoryName = field.replace(" : Score", "");
            matchedCategories.push(categoryName);
        }

        if (scoreA > 0 || scoreB > 0) {
            totalDifference += diff;
            validFields++;
        }
    }

    const maxPossibleDiff = validFields * 100;

    let similarityScore = 0;

    if (maxPossibleDiff > 0) {
        similarityScore =
            ((maxPossibleDiff - totalDifference) / maxPossibleDiff) * 100;
    }

    const preferencePenalty = calculatePreferencePenalty(studentA, studentB);

    similarityScore -= preferencePenalty.totalPenalty;
    similarityScore = Math.max(0, Math.min(100, Math.round(similarityScore)));

    return {
        similarityScore,
        matchedCategories,
        scoresA: JSON.stringify(scoresA, null, 2),
        scoresB: JSON.stringify(scoresB, null, 2),
        differences: JSON.stringify(differences, null, 2),
        penaltyReasons: preferencePenalty.penaltyReasons.join("; ")
    };
}

// Generate matches
let matchRecords = [];
let pairCount = 0;
let savedMatches = 0;
let skippedDuplicateNames = 0;

for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) {
        const studentA = students[i];
        const studentB = students[j];

        const nameA = studentA.getCellValueAsString("Name").trim();
        const nameB = studentB.getCellValueAsString("Name").trim();

        if (studentA.id === studentB.id) {
            continue;
        }

        if (nameA !== "" && nameA === nameB) {
            skippedDuplicateNames++;
            continue;
        }

        pairCount++;

        const similarity = calculateSimilarity(studentA, studentB);

        if (similarity.similarityScore >= minimumMatchScore) {
            matchRecords.push({
                fields: {
                    "Match Name": `${nameA} ↔ ${nameB}`,
                    "Student A": [{ id: studentA.id }],
                    "Student B": [{ id: studentB.id }],
                    "Matched Categories":
                        similarity.matchedCategories.length > 0
                            ? similarity.matchedCategories.map(cat => ({ name: cat }))
                            : undefined,
                    "Category Scores - Student A": similarity.scoresA,
                    "Category Scores - Student B": similarity.scoresB,
                    "Category Score Difference": similarity.differences,
                    "Aggregate Matching Score": similarity.similarityScore
                }
            });

            savedMatches++;
        }
    }
}

output.markdown(`## Checked ${pairCount} student pairs`);
output.markdown(`## Skipped duplicate-name matches: ${skippedDuplicateNames}`);
output.markdown(`## ${savedMatches} matches scored ≥ ${minimumMatchScore}`);

// Airtable batch limit
const batchSize = 50;

for (let i = 0; i < matchRecords.length; i += batchSize) {
    const batch = matchRecords.slice(i, i + batchSize);

    await matchesTable.createRecordsAsync(batch);

    output.markdown(
        `Created records ${i + 1} to ${Math.min(i + batchSize, matchRecords.length)}`
    );
}

output.markdown(`## ✅ Done! ${savedMatches} strong matches saved.`);
