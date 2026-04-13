// =====================
// CONFIG
// =====================

const studentsTableName = "Students";
const groupsTableName = "Groups";
const matchesTableName = "Student-Group Matches";

const minimumMatchScore = 70;
const maxGroupsPerStudent = 3;

const mismatchPenaltyByWeight = {
    3: 35,
    2: 15,
    1: 5
};

const scoreMappings = [
    {
        label: "University",
        studentScoreField: "University : Score",
        groupScoreField: "University : Score Rollup (from Students)"
    },
    {
        label: "Degree",
        studentScoreField: "Degree : Score",
        groupScoreField: "Degree : Score Rollup (from Students)"
    },
    {
        label: "Learning Habits",
        studentScoreField: "Learning Habits : Score",
        groupScoreField: "Learning Habits : Score Rollup (from Students)"
    },
    {
        label: "Struggling Concepts",
        studentScoreField: "Struggling Concepts : Score",
        groupScoreField: "Struggling Concepts : Score Rollup (from Students)"
    },
    {
        label: "Career Goals",
        studentScoreField: "Career Trajectories : Score",
        groupScoreField: "Career Trajectory : Score Rollup (from Students)"
    },
    {
        label: "Meet-up Distance",
        studentScoreField: "Meet-up Distance : Score",
        groupScoreField: "Meet-up Distance : Score Rollup (from Students)"
    }
];

const preferenceRules = [
    {
        label: "University",
        studentValueField: "University",
        studentWeightField: "University : Weight",
        groupValueField: "University (from Students)",
        matchMode: "contains"
    },
    {
        label: "Degree",
        studentValueField: "Degree",
        studentWeightField: "Degree : Weight",
        groupValueField: "Degree (from Students)",
        matchMode: "contains"
    },
    {
        label: "Learning Habits",
        studentValueField: "Learning Habits",
        studentWeightField: "Learning Habits : Weight",
        groupValueField: "Learning Habits (from Students)",
        matchMode: "overlap"
    },
    {
        label: "Struggling Concepts",
        studentValueField: "Struggling Concepts",
        studentWeightField: "Struggling Concepts : Weight",
        groupValueField: "Struggling Concepts (from Students)",
        matchMode: "overlap"
    },
    {
        label: "Career Goals",
        studentValueField: "Career Goals",
        studentWeightField: "Career Trajectories : Weight",
        groupValueField: "Career Goals (from Students)",
        matchMode: "overlap"
    },
    {
        label: "Meet-up Distance",
        studentValueField: "Meet-up Distance",
        studentWeightField: "Meet-up Distance : Weight",
        groupValueField: "Meet-up Distance (from Students)",
        matchMode: "contains"
    }
];

// =====================
// TABLES
// =====================

const studentsTable = base.getTable(studentsTableName);
const groupsTable = base.getTable(groupsTableName);
const matchesTable = base.getTable(matchesTableName);

// =====================
// CLEAR OLD MATCHES
// =====================

const existingMatches = await matchesTable.selectRecordsAsync();
let idsToDelete = existingMatches.records.map(record => record.id);

output.markdown(`## Clearing ${idsToDelete.length} old matches...`);

while (idsToDelete.length > 0) {
    await matchesTable.deleteRecordsAsync(idsToDelete.slice(0, 50));
    idsToDelete = idsToDelete.slice(50);
}

output.markdown(`## Old matches cleared`);

// =====================
// FETCH DATA
// =====================

const studentFields = [
    "Name",
    ...scoreMappings.map(m => m.studentScoreField),
    ...preferenceRules.flatMap(rule => [rule.studentValueField, rule.studentWeightField])
];

const groupFields = [
    "Group Name",
    "Students",
    ...scoreMappings.map(m => m.groupScoreField),
    ...preferenceRules.map(rule => rule.groupValueField)
];

const students = (await studentsTable.selectRecordsAsync({ fields: studentFields })).records;
const groups = (await groupsTable.selectRecordsAsync({ fields: groupFields })).records;

output.markdown(`## Found ${students.length} students`);
output.markdown(`## Found ${groups.length} groups`);

// =====================
// HELPERS
// =====================

function getNumericValue(record, fieldName) {
    const raw = record.getCellValue(fieldName);
    return typeof raw === "number" ? raw : 0;
}

function normalizeToArray(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value
            .map(v => {
                if (typeof v === "object" && v !== null) {
                    return (v.name || JSON.stringify(v)).toString().trim().toLowerCase();
                }
                return v.toString().trim().toLowerCase();
            })
            .filter(Boolean);
    }

    if (typeof value === "object" && value !== null) {
        return [(value.name || JSON.stringify(value)).toString().trim().toLowerCase()];
    }

    return [value.toString().trim().toLowerCase()];
}

function arraysOverlap(a, b) {
    const setB = new Set(b);
    return a.some(x => setB.has(x));
}

function contains(groupVals, studentVals) {
    const set = new Set(groupVals);
    return studentVals.every(v => set.has(v));
}

function studentAlreadyInGroup(student, group) {
    const members = group.getCellValue("Students") || [];
    return members.some(m => m.id === student.id);
}

function getRecordLabel(record, fallbackField) {
    return record.getCellValueAsString(fallbackField).trim();
}

function calculatePreferencePenalty(student, group) {
    let totalPenalty = 0;
    let reasons = [];

    for (const rule of preferenceRules) {
        const weight = getNumericValue(student, rule.studentWeightField);
        if (weight <= 0) continue;

        const studentVals = normalizeToArray(student.getCellValue(rule.studentValueField));
        const groupVals = normalizeToArray(group.getCellValue(rule.groupValueField));

        if (!studentVals.length || !groupVals.length) continue;

        let aligned = true;

        if (rule.matchMode === "contains") {
            aligned = contains(groupVals, studentVals);
        } else if (rule.matchMode === "overlap") {
            aligned = arraysOverlap(studentVals, groupVals);
        }

        if (!aligned) {
            const penalty = mismatchPenaltyByWeight[weight] || 0;
            totalPenalty += penalty;
            reasons.push(`${rule.label} mismatch (-${penalty})`);
        }
    }

    return { totalPenalty, reasons };
}

function calculateMatch(student, group) {
    let totalDiff = 0;
    let valid = 0;

    let studentScores = {};
    let groupScores = {};
    let diffs = {};

    for (const m of scoreMappings) {
        const s = getNumericValue(student, m.studentScoreField);
        const g = getNumericValue(group, m.groupScoreField);

        studentScores[m.label] = s;
        groupScores[m.label] = g;

        const diff = Math.abs(s - g);
        diffs[m.label] = diff;

        if (s > 0 || g > 0) {
            totalDiff += diff;
            valid++;
        }
    }

    const maxDiff = valid * 100;
    let score = maxDiff > 0 ? ((maxDiff - totalDiff) / maxDiff) * 100 : 0;

    const penalty = calculatePreferencePenalty(student, group);
    score -= penalty.totalPenalty;

    return {
        score: Math.max(0, Math.min(100, Math.round(score))),
        studentScores,
        groupScores,
        diffs,
        reasons: penalty.reasons.join("; ")
    };
}

// =====================
// MATCHING
// =====================

let results = [];
let totalPairsChecked = 0;
let skippedExistingMembership = 0;

for (const student of students) {
    let matches = [];

    for (const group of groups) {
        totalPairsChecked++;

        if (studentAlreadyInGroup(student, group)) {
            skippedExistingMembership++;
            continue;
        }

        const match = calculateMatch(student, group);

        if (match.score >= minimumMatchScore) {
            matches.push({
                student,
                group,
                ...match
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);

    const topMatches = matches.slice(0, maxGroupsPerStudent).map((match, index) => ({
        ...match,
        rank: String(index + 1)
    }));

    results.push(...topMatches);
}

output.markdown(`## Checked ${totalPairsChecked} student-group pairs`);
output.markdown(`## Skipped existing memberships: ${skippedExistingMembership}`);
output.markdown(`## Creating ${results.length} ranked matches...`);

// =====================
// CREATE RECORDS
// =====================

let records = results.map(r => ({
    fields: {
        "Match Name": `${getRecordLabel(r.student, "Name")} ↔ ${getRecordLabel(r.group, "Group Name")}`,
        "Student": [{ id: r.student.id }],
        "Group": [{ id: r.group.id }],
        "Category Scores - Student": JSON.stringify(r.studentScores, null, 2),
        "Category Scores - Group": JSON.stringify(r.groupScores, null, 2),
        "Category Score Difference": JSON.stringify(r.diffs, null, 2),
        "Aggregate Matching Score": r.score,
        "Rank": { name: r.rank },
        "Notes": r.reasons || undefined
    }
}));

for (let i = 0; i < records.length; i += 50) {
    await matchesTable.createRecordsAsync(records.slice(i, i + 50));
    output.markdown(
        `Created records ${i + 1} to ${Math.min(i + 50, records.length)}`
    );
}

output.markdown(`## ✅ Created ${records.length} ranked matches`);
