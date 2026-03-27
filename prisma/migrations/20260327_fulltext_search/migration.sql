-- Add FULLTEXT index on document_chunks.content for keyword search.
-- Enables MySQL MATCH ... AGAINST for hybrid retrieval (RRF fusion with vector search).
-- InnoDB FULLTEXT uses built-in parser with stopword filtering.

CREATE FULLTEXT INDEX `idx_document_chunks_content_ft` ON `document_chunks`(`content`);

-- Also index heading fields for section-aware keyword filtering.
CREATE FULLTEXT INDEX `idx_document_chunks_headings_ft` ON `document_chunks`(`heading_l1`, `heading_l2`, `heading_l3`);
