# StudBud_Backend
# Student Matching Scripts

This project contains JavaScript scripts used in Airtable to match students based on compatibility.

## Overview

The scripts compare students using score-based metrics and preference weights to generate compatibility matches. Results are written to a separate table for review.

## Features

* Score-based similarity calculation
* Weighted preference matching
* Penalty system for mismatches
* Student-to-student and student-to-group matching

## Setup

Requires an Airtable base with:

* Students table
* Groups table (for group matching)
* Match output table
* Predefined score, weight, and rollup fields

## Usage

1. Open Airtable
2. Go to the Scripting or Automation extension
3. Paste in the script
4. Run the script

## Notes

* Designed to run inside Airtable
* Relies on existing formula and rollup fields
* Not intended as a standalone application
