# Domain Glossary

- **Case**: A disciplinary or guidance record involving one or more students.
- **CasePayload**: The structured data transfer object (DTO) submitted from the frontend to create or update a Case.
- **StudentInfo**: A strongly-typed representation of a student involved in a Case, ensuring the boundary enforces structured data rather than raw JSON strings.
- **ImportRow**: A unified model representing a row in an Excel import. It encapsulates both the raw data and its own validation logic (`validate()`).
