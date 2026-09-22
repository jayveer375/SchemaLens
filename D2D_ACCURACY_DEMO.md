# D2D Schema Generation Accuracy Improvements

## Problem Fixed
The AI was generating unrelated tables even when input clearly described another domain.

**Example Problem:**
- Input: "Online Library Management System" 
- Old Output: `USER, ORDER, PRODUCT, images, image_shares, content_items, subscriptions`
- Expected: `USER, BOOK, LOAN`

## Solution Implemented

### 1. Enhanced Analysis (`analyze-text` route)
- **Domain Detection**: Identifies specific domains (library, hospital, e-commerce, etc.)
- **Evidence Extraction**: Every entity needs textual evidence from input
- **Confidence Scoring**: High/Medium/Low confidence for each entity  
- **Ambiguity Detection**: Flags unclear input requiring clarification

### 2. Validation Layer
- **Entity Filtering**: Only include entities with clear evidence
- **Relationship Validation**: FK must reference existing PK from validated entities
- **Domain Consistency**: Reject entities that don't match detected domain

### 3. Improved Prompts
- **Domain-Aware**: Library → isbn, title, due_date (not generic fields)
- **Evidence-Based**: "ONLY use entities from EXTRACTED_ENTITIES with evidence"
- **Validation Errors**: Return error if insufficient validated entities

## New Analysis Output Structure

```json
{
  "domain": "library",
  "confidence": "high", 
  "is_ambiguous": false,
  "core_entities": [
    {
      "name": "Book",
      "evidence": "library books with ISBN, title, author",
      "attributes": ["isbn", "title", "author", "available"],
      "confidence": "high"
    },
    {
      "name": "User", 
      "evidence": "users who can borrow books",
      "attributes": ["membership_id", "name", "contact_info"],
      "confidence": "high"
    },
    {
      "name": "Loan",
      "evidence": "track book loans, due dates",
      "attributes": ["book_id", "user_id", "borrowed_date", "due_date"],
      "confidence": "high"
    }
  ],
  "relationships": [
    {
      "from": "User", "to": "Loan", 
      "type": "one-to-many", "label": "makes",
      "evidence": "users who can borrow books"
    }
  ],
  "validation": {
    "is_ambiguous": false,
    "total_entities": 3,
    "entities_with_evidence": 3,
    "needs_clarification": false
  }
}
```

## Schema Generation Improvements

### Before (Inaccurate)
```sql
CREATE TABLE users (id, email, name, password);
CREATE TABLE images (id, url, title, user_id); 
CREATE TABLE image_shares (id, image_id, user_id);
CREATE TABLE subscriptions (id, user_id, plan);
-- Completely wrong for a library!
```

### After (Accurate)  
```sql
-- Library members who borrow books
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    membership_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    membership_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Books in the library collection
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    isbn VARCHAR(13) UNIQUE,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    publisher VARCHAR(255),
    publication_year INTEGER,
    is_available BOOLEAN DEFAULT TRUE,
    location VARCHAR(50)
);

-- Book loan transactions
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    book_id INTEGER NOT NULL REFERENCES books(id), 
    borrowed_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    returned_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    fine_amount DECIMAL(10,2) DEFAULT 0.00
);
```

## Validation Rules Added

1. **Entity Evidence Check**: Each entity needs clear textual evidence
2. **Domain Consistency**: Entities must match detected domain  
3. **Relationship Validation**: All FK must reference existing PK
4. **Confidence Threshold**: Only include medium/high confidence entities
5. **Ambiguity Handling**: Ask for clarification if input unclear
6. **Maximum Entities**: Cap at 6-8 entities for accuracy over quantity

## Test Cases

### ✅ Library Management System
- **Input**: "Online Library Management System with users who can borrow books..."
- **Expected**: User, Book, Loan tables
- **Result**: ✅ Correct domain-specific schema

### ✅ Hospital System  
- **Input**: "Hospital management with patients scheduling appointments..."
- **Expected**: Patient, Doctor, Appointment tables
- **Result**: ✅ Medical domain schema (not generic CMS)

### ✅ Ambiguous Input
- **Input**: "Some kind of system"
- **Expected**: Request clarification
- **Result**: ✅ `is_ambiguous: true, needs_clarification: true`

## Key Accuracy Metrics

- **Semantic Accuracy**: Entities match described domain
- **Evidence Requirement**: Every entity has textual proof
- **Relationship Validity**: FK references validated entities
- **Domain Consistency**: No cross-domain entity pollution
- **Confidence Scoring**: Clear accuracy assessment

## Priority Achieved
✅ **SEMANTIC ACCURACY > NUMBER OF TABLES > VISUAL DESIGN**

The system now prioritizes getting the right entities for the described domain over generating many tables or complex diagrams.