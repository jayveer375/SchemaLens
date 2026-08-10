
# 🔍 SchemaLens

### Design. Generate. Analyze. Migrate.

SchemaLens is a modern database design and SQL development platform that brings **ER diagrams, SQL generation, SQL editing, schema conversion, migration, and AI-assisted database workflows** into one unified workspace.

It helps developers and students visually design databases, generate SQL, modify schemas, analyze database structures, and move seamlessly between ER diagrams and SQL.

---

## 🚀 Features

### ⚡ Quick Convert

Quick Convert provides a fast way to move between database representations.

```text
ER Diagram → SQL → SQL Playground → Updated ER Diagram
````

It allows users to quickly convert their database design into SQL, edit the SQL, and convert the modified schema back into an ER diagram.

---

### 🧬 ER Diagram Studio

Design and visualize relational database schemas using interactive ER diagrams.

**Features:**

* Create database tables
* Add and edit columns
* Define primary keys
* Define foreign keys
* Create relationships
* Visualize database structure
* Modify database schemas visually
* Generate SQL from ER diagrams
* Convert SQL schemas into ER diagrams

---

### 🧑‍💻 Generate SQL

Generate SQL directly from your database schema.

SchemaLens converts the visual ER diagram into SQL statements that can be reviewed and edited in the SQL Playground.

**Example:**

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150)
);
```

Generated SQL can be opened directly in the SQL Playground for further editing.

---

### 🛠️ SQL Playground

A dedicated workspace for writing and editing SQL.

**Features:**

* SQL editor
* SQL formatting
* Schema-aware workflows
* Edit generated SQL
* Copy SQL
* Convert SQL into ER diagrams
* Open generated SQL
* Convert edited SQL back into an ER diagram

**Workflow:**

```text
Generate SQL
     ↓
SQL Playground
     ↓
Edit SQL
     ↓
Convert
     ↓
Updated ER Diagram
```

---

### 🔄 Schema Migration

SchemaLens provides a migration workflow for managing changes between database schemas.

**Example:**

Old schema:

```text
users
 ├── id
 ├── name
 └── email
```

New schema:

```text
users
 ├── id
 ├── name
 ├── email
 └── phone
```

Detected change:

```text
+ users.phone
```

Example migration SQL:

```sql
ALTER TABLE users
ADD COLUMN phone VARCHAR(20);
```

The migration workflow helps developers understand and manage database schema changes.

---

### 🤖 AI Database Assistant

SchemaLens includes an AI-assisted workflow for working with SQL and database schemas.

#### Explain SQL

Understand SQL queries using natural-language explanations.

The assistant can explain:

* Tables involved
* Columns involved
* JOIN relationships
* Filtering conditions
* Grouping
* Sorting
* Query purpose

#### Generate SQL

Describe what you want in natural language and generate SQL using the available database schema.

Example:

```text
Find all users who placed an order above ₹5000.
```

#### Analyze Schema

Analyze the current database schema and identify potential issues such as:

* Missing primary keys
* Missing foreign keys
* Relationship problems
* Potential indexing opportunities
* Naming inconsistencies
* Basic normalization concerns

#### Optimize SQL

Analyze SQL queries and provide suggestions related to:

* Query structure
* JOIN usage
* Potential index requirements
* Redundant operations
* Query readability

> AI-generated SQL is provided for review and is not automatically executed.

---

## 🔄 Complete Database Workflow

```text
                  CREATE PROJECT
                        │
                        ↓
                   ER DIAGRAM
                        │
              ┌─────────┴─────────┐
              ↓                   ↓
         GENERATE SQL        QUICK CONVERT
              │                   │
              └─────────┬─────────┘
                        ↓
                 SQL PLAYGROUND
                        │
                        ↓
                    EDIT SQL
                        │
                        ↓
                 CONVERT BACK
                        │
                        ↓
                UPDATED SCHEMA
                        │
                        ↓
                 ANALYZE SCHEMA
                        │
                        ↓
                     MIGRATE
                        │
                        ↓
                  FINAL SCHEMA
```

---

## 🎯 Why SchemaLens?

Database development often requires switching between different tools for:

* ER diagrams
* SQL editors
* Schema conversion
* SQL generation
* Database analysis
* Schema migration

SchemaLens brings these workflows together into a single platform.

```text
ER Diagram
     +
SQL Playground
     +
SQL Generation
     +
Schema Conversion
     +
Migration
     +
AI Assistance
     ↓
SchemaLens
```

---

## 🛠️ Technology Stack

### Frontend

* React
* TypeScript
* HTML5
* CSS
* Responsive UI

### Backend

* Python
* FastAPI
* REST APIs

### Database

* PostgreSQL
* SQLite
* SQL

### AI

* AI-assisted SQL generation
* Natural-language database interaction
* SQL explanation
* Schema analysis
* SQL optimization

### Development Tools

* Git
* GitHub
* VS Code
* Kiro
* AI-assisted development tools

---

## 📁 Project Structure

```text
SchemaLens/
│
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   └── ...
│
├── backend/
│   ├── routes/
│   ├── services/
│   ├── models/
│   └── ...
│
├── database/
│   └── ...
│
├── README.md
├── .gitignore
└── ...
```

---

## ⚙️ Installation

### Prerequisites

Make sure you have:

* Node.js
* npm
* Python 3.x
* Git

### Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/SchemaLens.git
```

### Enter the Project

```bash
cd SchemaLens
```

### Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Start the Frontend

```bash
npm run dev
```

### Backend Setup

If the project contains a Python backend:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the backend using the configured project command.

---

## 🔐 Environment Variables

Create a `.env` file for environment-specific configuration.

Example:

```env
DATABASE_URL=your_database_connection_string
AI_API_KEY=your_ai_api_key
```

Never commit API keys, passwords, or database credentials to GitHub.

Recommended `.gitignore` entries:

```text
.env
.env.local
.env.*.local
```

---

## 🧪 Example Usage

### 1. Create a Project

Create a new database project from the SchemaLens dashboard.

### 2. Design Your Database

Create tables, columns, primary keys, foreign keys, and relationships using the ER Diagram Studio.

### 3. Generate SQL

Convert your ER diagram into SQL.

### 4. Open SQL Playground

Open the generated SQL in the SQL Playground.

### 5. Edit SQL

Modify the SQL according to your requirements.

### 6. Convert Back

Convert the edited SQL back into an updated ER diagram.

### 7. Analyze

Use the database analysis and AI assistant features to inspect the schema or SQL.

### 8. Migrate

Use the migration workflow to manage schema changes.

---

## 📱 Responsive Design

SchemaLens is designed to work across:

* Desktop
* Laptop
* Tablet
* Mobile

The interface adapts the database workspace and navigation for different screen sizes.

---

## 🔒 Security

SchemaLens follows a review-first approach for AI-generated SQL.

AI-generated SQL should always be reviewed before execution.

The application should never expose:

* Database passwords
* API keys
* Environment variables
* Private database connection strings

Destructive SQL operations such as:

```sql
DROP
DELETE
TRUNCATE
UPDATE
ALTER
```

should require explicit user confirmation before execution.

---

## 🔮 Future Improvements

* [ ] Advanced AI Database Assistant
* [ ] Schema version history
* [ ] Advanced schema diff
* [ ] Automatic migration generation
* [ ] Mock data generation
* [ ] Index advisor
* [ ] Query execution plan visualization
* [ ] Database connection management
* [ ] PostgreSQL integration
* [ ] MySQL integration
* [ ] SQLite integration
* [ ] Database documentation generation
* [ ] PDF documentation export
* [ ] Project sharing
* [ ] Real-time collaboration
* [ ] Backend/API code generation
* [ ] Database import from existing databases

---

## 🎓 Project Purpose

SchemaLens was developed as a practical software engineering project to explore:

* Database design
* ER modeling
* SQL
* Full-stack development
* REST APIs
* Database management
* AI-assisted development
* Modern web application architecture

The project focuses on making database development more accessible through a combination of **visual design, SQL tooling, schema conversion, migration workflows, and AI assistance**.

---

## 👨‍💻 Developer

### Bhavesh Shimpi

**Computer Engineering Student**

Interested in:

* Full-Stack Development
* Python
* Java
* AI
* Database Systems
* Web Development
* Software Engineering

---

## 📌 Project Highlights

```text
✓ ER Diagram Designer
✓ SQL Generation
✓ SQL Playground
✓ Quick Convert
✓ SQL → ER Conversion
✓ ER → SQL Conversion
✓ Schema Migration
✓ AI Database Assistant
✓ SQL Explanation
✓ Natural-Language SQL Generation
✓ Schema Analysis
✓ SQL Optimization
✓ Responsive Interface
✓ Light / Dark Theme
```

---

## ⭐ Project Vision

SchemaLens aims to provide a unified workspace for modern database development.

```text
        DESIGN
          ↓
      VISUALIZE
          ↓
       GENERATE
          ↓
         EDIT
          ↓
       ANALYZE
          ↓
       OPTIMIZE
          ↓
       MIGRATE
          ↓
        IMPROVE
```

### SchemaLens

**Design your database. Generate your SQL. Analyze your schema. Migrate with confidence.**

---

## 📄 License

This project is currently intended for educational and portfolio purposes.

```

**Only replace `YOUR_USERNAME`** with your GitHub username before committing it.
```
