I separated medical data into its own table because it applies only to a subset of documents and contains domain-specific fields that are not relevant to other document types.

This avoids null-heavy schemas, improves queryability (e.g., filtering by fitness status), and keeps the core extraction table focused on general document metadata.

This design also allows future extensibility for other specialized document categories without turning the extraction table into a monolithic structure.