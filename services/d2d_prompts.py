"""
D2D (Document to Diagram) - Mistral Prompts Service
Contains all prompts for analyzing images, documents, text and generating diagrams
"""

# ─────────────────────────────────────────────────────────────────────────────
# ANALYZER PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

def get_image_analyzer_prompt() -> str:
    """Prompt for analyzing uploaded images and recommending diagram types"""
    return """You are a professional database and systems architect analyzing diagrams.

Given an image, extract ALL entities, relationships, processes, components, and flows.

OUTPUT FORMAT (JSON ONLY - no extra text):
{
  "diagram_type_detected": "one of: er, class, usecase, flowchart, dfd, sequence, activity, architecture, component, schema",
  "confidence": "high|medium|low",
  "entities": [{"name": "...", "attributes": [...], "type": "table|class|actor|component"}],
  "relationships": [{"from": "...", "to": "...", "type": "1:N|N:N|inheritance|composition"}],
  "processes": [{"name": "...", "description": "...", "inputs": [...], "outputs": [...]}],
  "data_flows": [{"from": "...", "to": "...", "data": "..."}],
  "text_content": "Any readable text from image",
  "notes": "Anything unclear or ambiguous"
}

Analyze carefully:
1. Entity boxes → table names
2. Relationship lines → FK relationships
3. Underlines → primary keys
4. Actors/stick figures → use case actors
5. Process boxes → flows/activities
6. Data stores → database entities
7. Arrows → data flows or relationships"""


def get_document_analyzer_prompt(content: str) -> str:
    """Prompt for analyzing document content and recommending diagram types"""
    return f"""You are a technical requirements analyst.

Analyze the following document content and identify key information useful for diagrams:

DOCUMENT CONTENT:
{content[:2000]}

OUTPUT FORMAT (JSON ONLY):
{{
  "document_type": "srs|requirements|specification|api_docs|flow_diagram|architecture|other",
  "recommended_diagram_types": ["usecase", "flowchart", "dfd", ...],
  "entities": [{{"name": "...", "description": "...", "type": "table|class|actor|component"}}],
  "relationships": [{{"from": "...", "to": "...", "description": "..."}}],
  "processes": [{{"name": "...", "description": "...", "steps": [...]}}],
  "actors": [{{"name": "...", "role": "...", "interactions": [...]}}],
  "data_flows": [{{"from": "...", "to": "...", "data": "..."}}],
  "key_requirements": ["...", "..."],
  "summary": "1-2 sentence summary"
}}

Focus on:
1. Nouns → potential entities/actors/components
2. Verbs → potential actions/processes/flows
3. Requirements → use cases
4. Dependencies → relationships"""


def get_text_analyzer_prompt(text: str) -> str:
    """Prompt for analyzing user text and recommending diagram types"""
    return f"""You are a system design expert.

Analyze user text description and identify what type of diagram would be useful:

USER TEXT:
{text[:1000]}

OUTPUT FORMAT (JSON ONLY):
{{
  "recommended_diagram_types": ["flowchart", "usecase", ...],
  "confidence": "high|medium|low",
  "entities_or_actors": [...],
  "processes_or_interactions": [...],
  "summary": "...",
  "reason": "Why these diagrams are recommended"
}}

Return ONLY JSON, no other text."""


# ─────────────────────────────────────────────────────────────────────────────
# DIAGRAM GENERATOR PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

def get_er_diagram_prompt(entities: list, relationships: list) -> str:
    """Generate ER diagram Mermaid code"""
    entities_str = "\n".join([f"  {e.get('name', 'Entity')}: {', '.join(e.get('attributes', []))}" for e in entities])
    rels_str = "\n".join([f"  {r.get('from', 'A')} --|{r.get('type', '1:N')}-- {r.get('to', 'B')}" for r in relationships])
    
    return f"""Generate a complete Mermaid ER diagram based on:

ENTITIES:
{entities_str}

RELATIONSHIPS:
{rels_str}

OUTPUT ONLY the Mermaid code starting with "erDiagram" - no other text:

Example format:
erDiagram
    CUSTOMER ||--o{{ ORDER : places
    CUSTOMER {{
        int customer_id PK
        string name
    }}
    ORDER {{
        int order_id PK
        int customer_id FK
    }}"""


def get_class_diagram_prompt(entities: list, relationships: list) -> str:
    """Generate Class diagram Mermaid code"""
    return f"""Generate a complete Mermaid class diagram from:

Classes: {entities}
Relationships: {relationships}

OUTPUT ONLY Mermaid code starting with "classDiagram" - no extra text:

Example:
classDiagram
    class Animal {{
        +String name
        +int age
        +void eat()
    }}
    Animal <|-- Dog"""


def get_usecase_diagram_prompt(actors: list, processes: list) -> str:
    """Generate Use Case diagram Mermaid code"""
    return f"""Generate a Mermaid use case diagram from:

Actors: {actors}
Use Cases: {processes}

OUTPUT ONLY Mermaid code starting with "graph" - no extra text:

Example:
graph TD
    Actor1((User))
    UC1[Login]
    Actor1 -->|performs| UC1"""


def get_flowchart_prompt(processes: list, flows: list) -> str:
    """Generate Flowchart Mermaid code"""
    return f"""Generate a Mermaid flowchart from:

Processes: {processes}
Flows: {flows}

OUTPUT ONLY Mermaid code starting with "flowchart TD" - no extra text:

Example:
flowchart TD
    Start([Start])
    Process[Process Data]
    End([End])
    Start --> Process --> End"""


def get_dfd_prompt(entities: list, processes: list, flows: list) -> str:
    """Generate DFD (Data Flow Diagram) Mermaid code"""
    return f"""Generate a Mermaid Data Flow Diagram from:

Data Stores: {entities}
Processes: {processes}
Data Flows: {flows}

OUTPUT ONLY Mermaid code - no extra text:

Example:
graph LR
    User((User))
    Process1[Process 1]
    DB1[(Database)]
    Process1 -->|Query| DB1"""


def get_sequence_diagram_prompt(actors: list, processes: list) -> str:
    """Generate Sequence diagram Mermaid code"""
    return f"""Generate a Mermaid sequence diagram from:

Actors: {actors}
Interactions: {processes}

OUTPUT ONLY Mermaid code starting with "sequenceDiagram" - no extra text:

Example:
sequenceDiagram
    participant User
    participant API
    User->>API: Send Request
    API-->>User: Return Response"""


def get_activity_diagram_prompt(processes: list, flows: list) -> str:
    """Generate Activity diagram Mermaid code"""
    return f"""Generate a Mermaid activity diagram from:

Activities: {processes}
Flow: {flows}

OUTPUT ONLY Mermaid code starting with "flowchart TD" - no extra text:

Example:
flowchart TD
    Start([Start Activity])
    Activity1[Activity 1]
    End([End])
    Start --> Activity1 --> End"""


def get_architecture_diagram_prompt(entities: list, relationships: list) -> str:
    """Generate System Architecture diagram Mermaid code"""
    return f"""Generate a Mermaid architecture diagram showing system components:

Components: {entities}
Connections: {relationships}

OUTPUT ONLY Mermaid code - no extra text:

Example:
graph TB
    Client[Client]
    API[API Server]
    DB[Database]
    Client -->|Request| API
    API -->|Query| DB"""


def get_component_diagram_prompt(entities: list, relationships: list) -> str:
    """Generate Component diagram Mermaid code"""
    return f"""Generate a Mermaid component diagram from:

Components: {entities}
Interfaces: {relationships}

OUTPUT ONLY Mermaid code - no extra text:

Example:
graph LR
    Comp1[Component A]
    Comp2[Component B]
    Comp1 -->|depends on| Comp2"""


def get_schema_diagram_prompt(entities: list, relationships: list) -> str:
    """Generate Database Schema diagram Mermaid code"""
    return f"""Generate a Mermaid ER diagram for database schema:

Tables: {entities}
Foreign Keys: {relationships}

OUTPUT ONLY Mermaid ER code - no extra text:

Example:
erDiagram
    USERS ||--o{{ ORDERS : places
    USERS {{
        int user_id PK
        string email
    }}"""


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT SELECTOR
# ─────────────────────────────────────────────────────────────────────────────

def get_generator_prompt(diagram_type: str, entities: list = None, relationships: list = None, 
                        processes: list = None, flows: list = None, actors: list = None) -> str:
    """Get the appropriate generator prompt based on diagram type"""
    
    entities = entities or []
    relationships = relationships or []
    processes = processes or []
    flows = flows or []
    actors = actors or []
    
    if diagram_type == "er":
        return get_er_diagram_prompt(entities, relationships)
    elif diagram_type == "class":
        return get_class_diagram_prompt(entities, relationships)
    elif diagram_type == "usecase":
        return get_usecase_diagram_prompt(actors, processes)
    elif diagram_type == "flowchart":
        return get_flowchart_prompt(processes, flows)
    elif diagram_type == "dfd":
        return get_dfd_prompt(entities, processes, flows)
    elif diagram_type == "sequence":
        return get_sequence_diagram_prompt(actors, processes)
    elif diagram_type == "activity":
        return get_activity_diagram_prompt(processes, flows)
    elif diagram_type == "architecture":
        return get_architecture_diagram_prompt(entities, relationships)
    elif diagram_type == "component":
        return get_component_diagram_prompt(entities, relationships)
    elif diagram_type == "schema":
        return get_schema_diagram_prompt(entities, relationships)
    else:
        return get_flowchart_prompt(processes, flows)  # Default
