//! PHP concept extraction with docblock awareness

use crate::parsing::NameExtractor;
use crate::types::{LineRange, ParseError, SemanticConcept};
use regex::Regex;
use std::collections::HashMap;
use tree_sitter::Node;

pub struct PhpExtractor;

impl PhpExtractor {
    pub fn new() -> Self {
        Self
    }

    pub fn extract_concepts(
        &self,
        node: Node<'_>,
        file_path: &str,
        content: &str,
        concepts: &mut Vec<SemanticConcept>,
    ) -> Result<(), ParseError> {
        match node.kind() {
            "class_declaration"
            | "interface_declaration"
            | "trait_declaration"
            | "enum_declaration" => {
                if let Some(concept) =
                    self.build_named_construct(node, file_path, content, node.kind())?
                {
                    concepts.push(concept);
                }
            }
            "function_definition" => {
                if let Some(concept) =
                    self.build_named_construct(node, file_path, content, "function")?
                {
                    concepts.push(concept);
                }
            }
            "method_declaration" => {
                if let Some(concept) =
                    self.build_named_construct(node, file_path, content, "method")?
                {
                    concepts.push(concept);
                }
            }
            "property_declaration" => {
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "property_element" {
                        if let Some(concept) =
                            self.build_named_construct(child, file_path, content, "property")?
                        {
                            concepts.push(concept);
                        }
                    }
                }
            }
            "property_promotion_parameter" => {
                if let Some(concept) =
                    self.build_named_construct(node, file_path, content, "property")?
                {
                    concepts.push(concept);
                }
            }
            "const_declaration" => {
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "constant_declarator" {
                        if let Some(concept) =
                            self.build_named_construct(child, file_path, content, "constant")?
                        {
                            concepts.push(concept);
                        }
                    }
                }
            }
            "namespace_definition" => {
                if let Some(concept) =
                    self.build_named_construct(node, file_path, content, "namespace")?
                {
                    concepts.push(concept);
                }
            }
            _ => {}
        }

        Ok(())
    }

    fn build_named_construct(
        &self,
        node: Node<'_>,
        file_path: &str,
        content: &str,
        concept_type: &str,
    ) -> Result<Option<SemanticConcept>, ParseError> {
        let name = Self::extract_name(node, content)?;
        if name.is_empty() {
            return Ok(None);
        }

        let (start_line, start_col, end_line, end_col) = NameExtractor::get_position_info(node);

        let mut metadata = HashMap::new();
        metadata.insert("language".to_string(), "php".to_string());
        let normalized_type = Self::normalize_concept_type(concept_type);

        metadata.insert("kind".to_string(), normalized_type.to_string());
        metadata.insert("start_column".to_string(), start_col.to_string());
        metadata.insert("end_column".to_string(), end_col.to_string());

        if let Some(visibility) = Self::extract_visibility(node, content) {
            metadata.insert("visibility".to_string(), visibility);
        }
        if Self::has_modifier(node, "static") {
            metadata.insert("static".to_string(), "true".to_string());
        }
        if Self::has_modifier(node, "abstract") {
            metadata.insert("abstract".to_string(), "true".to_string());
        }
        if Self::has_modifier(node, "final") {
            metadata.insert("final".to_string(), "true".to_string());
        }
        if let Some(return_type) = Self::extract_return_type(node, content) {
            metadata.insert("return_type".to_string(), return_type);
        }
        if let Some(annotation) = Self::extract_type_annotation(node, content) {
            metadata.insert("type".to_string(), annotation);
        }

        // Docblock parsing
        if let Some(docblock) = Self::extract_docblock(node, content) {
            if !docblock.description.is_empty() {
                metadata.insert("docblock.description".to_string(), docblock.description);
            }
            if !docblock.params.is_empty() {
                metadata.insert("docblock.params".to_string(), docblock.params.join("|"));
            }
            if let Some(ret) = docblock.returns {
                metadata.insert("docblock.return".to_string(), ret);
            }
            if !docblock.throws.is_empty() {
                metadata.insert("docblock.throws".to_string(), docblock.throws.join("|"));
            }
        }

        // Traits used within classes
        if normalized_type == "class" {
            let traits = Self::collect_traits(node, content);
            if !traits.is_empty() {
                metadata.insert("traits".to_string(), traits.join(","));
            }
        }

        Ok(Some(SemanticConcept {
            id: format!("php::{}::{}::{}", concept_type, file_path, name),
            name,
            concept_type: normalized_type.to_string(),
            confidence: 0.85,
            file_path: file_path.to_string(),
            line_range: LineRange {
                start: start_line,
                end: end_line,
            },
            relationships: HashMap::new(),
            metadata,
        }))
    }

    fn normalize_concept_type(concept_type: &str) -> &str {
        match concept_type {
            "class_declaration" => "class",
            "interface_declaration" => "interface",
            "trait_declaration" => "trait",
            "enum_declaration" => "enum",
            other => other,
        }
    }

    fn extract_name(node: Node<'_>, content: &str) -> Result<String, ParseError> {
        if let Some(named) = node.child_by_field_name("name") {
            if let Some(text) = NameExtractor::extract_node_text(named, content) {
                return Ok(text.to_string());
            }
        }

        let fallback = NameExtractor::extract_name_from_node(node, content)
            .map_err(ParseError::from_reason)?;
        if !fallback.is_empty() {
            return Ok(fallback);
        }

        if let Some(var_node) = NameExtractor::find_child_by_kind(node, "variable_name") {
            if let Some(text) = NameExtractor::extract_node_text(var_node, content) {
                return Ok(text.trim_start_matches('$').to_string());
            }
        }

        Ok(String::new())
    }

    fn extract_visibility(node: Node<'_>, content: &str) -> Option<String> {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "visibility_modifier" => {
                    if let Some(text) = NameExtractor::extract_node_text(child, content) {
                        return Some(text.to_string());
                    }
                }
                "public" | "protected" | "private" => return Some(child.kind().to_string()),
                _ => {}
            }
        }
        None
    }

    fn has_modifier(node: Node<'_>, token: &str) -> bool {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            let modifier_kind = format!("{}_modifier", token);
            if child.kind() == modifier_kind || child.kind() == token {
                return true;
            }
        }
        false
    }

    fn extract_return_type(node: Node<'_>, content: &str) -> Option<String> {
        if let Some(return_type) = node.child_by_field_name("return_type") {
            return NameExtractor::extract_node_text(return_type, content)
                .map(|s| s.trim().to_string());
        }
        None
    }

    fn extract_type_annotation(node: Node<'_>, content: &str) -> Option<String> {
        if let Some(type_node) = node.child_by_field_name("type") {
            return NameExtractor::extract_node_text(type_node, content)
                .map(|s| s.trim().to_string());
        }
        if let Some(type_node) = node.child_by_field_name("type_declaration") {
            return NameExtractor::extract_node_text(type_node, content)
                .map(|s| s.trim().to_string());
        }
        None
    }

    fn collect_traits(node: Node<'_>, content: &str) -> Vec<String> {
        let mut traits = Vec::new();
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == "trait_use_clause" {
                let names = NameExtractor::collect_identifiers_from_node(child, content);
                for name in names {
                    if !name.is_empty() {
                        traits.push(name);
                    }
                }
            }
        }
        if traits.is_empty() {
            if let Some(text) = NameExtractor::extract_node_text(node, content) {
                let re = Regex::new(r"(?m)^\s*use\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;").unwrap();
                for caps in re.captures_iter(text) {
                    if let Some(m) = caps.get(1) {
                        traits.push(m.as_str().to_string());
                    }
                }
            }
        }
        traits.sort();
        traits.dedup();
        traits
    }

    fn extract_docblock(node: Node<'_>, content: &str) -> Option<DocblockInfo> {
        let mut current = node.prev_sibling();
        while let Some(prev) = current {
            match prev.kind() {
                "comment" | "phpdoc_comment" => {
                    if let Some(text) = NameExtractor::extract_node_text(prev, content) {
                        if text.trim_start().starts_with("/**") {
                            return Some(parse_docblock(text));
                        }
                    }
                    break;
                }
                "inline_comment" => break,
                _ => {
                    if !prev.is_extra() {
                        break;
                    }
                }
            }
            current = prev.prev_sibling();
        }
        None
    }
}

struct DocblockInfo {
    description: String,
    params: Vec<String>,
    returns: Option<String>,
    throws: Vec<String>,
}

fn parse_docblock(raw: &str) -> DocblockInfo {
    let mut description_lines = Vec::new();
    let mut params = Vec::new();
    let mut returns = None;
    let mut throws = Vec::new();

    let param_re = Regex::new(r"@param\s+([^\s]+)\s+\$?(\w+)").unwrap();
    let return_re = Regex::new(r"@return\s+([^\s]+)").unwrap();
    let throws_re = Regex::new(r"@throws\s+([^\s]+)").unwrap();

    for line in raw.lines() {
        let cleaned = line.trim().trim_start_matches('*').trim();
        if cleaned.starts_with('@') {
            if let Some(caps) = param_re.captures(cleaned) {
                let ty = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let name = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                params.push(format!("{} ${}", ty, name));
            } else if let Some(caps) = return_re.captures(cleaned) {
                returns = caps.get(1).map(|m| m.as_str().to_string());
            } else if let Some(caps) = throws_re.captures(cleaned) {
                if let Some(value) = caps.get(1) {
                    throws.push(value.as_str().to_string());
                }
            }
        } else if !cleaned.is_empty() {
            description_lines.push(cleaned.to_string());
        }
    }

    DocblockInfo {
        description: description_lines.join(" "),
        params,
        returns,
        throws,
    }
}

impl Default for PhpExtractor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsing::ParserManager;

    fn walk_tree(
        node: Node<'_>,
        extractor: &PhpExtractor,
        file_path: &str,
        content: &str,
        concepts: &mut Vec<SemanticConcept>,
    ) {
        let _ = extractor.extract_concepts(node, file_path, content, concepts);
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            walk_tree(child, extractor, file_path, content, concepts);
        }
    }

    #[test]
    fn captures_docblock_metadata() {
        let extractor = PhpExtractor::new();
        let mut manager = ParserManager::new().unwrap();
        let code = r#"<?php
/**
 * Find a user by id.
 *
 * @param int $id
 * @return ?User
 * @throws NotFoundException
 */
function findUser(int $id): ?User {
    return null;
}
"#;
        let tree = manager.parse(code, "php").unwrap();
        let mut concepts = Vec::new();
        walk_tree(
            tree.root_node(),
            &extractor,
            "user.php",
            code,
            &mut concepts,
        );

        let func = concepts
            .iter()
            .find(|c| c.name == "findUser")
            .expect("function concept");
        assert_eq!(
            func.metadata.get("docblock.return").map(String::as_str),
            Some("?User")
        );
        assert!(func
            .metadata
            .get("docblock.params")
            .map(|s| s.contains("int $id"))
            .unwrap_or(false));
        assert!(func
            .metadata
            .get("docblock.throws")
            .map(|s| s.contains("NotFoundException"))
            .unwrap_or(false));
    }

    #[test]
    fn captures_trait_usage() {
        let extractor = PhpExtractor::new();
        let mut manager = ParserManager::new().unwrap();
        let code = r#"<?php
trait Loggable {}

class Service {
    use Loggable;
}
"#;
        let tree = manager.parse(code, "php").unwrap();
        let mut concepts = Vec::new();
        walk_tree(
            tree.root_node(),
            &extractor,
            "service.php",
            code,
            &mut concepts,
        );

        let class = concepts
            .iter()
            .find(|c| c.name == "Service")
            .expect("class concept");
        assert_eq!(
            class.metadata.get("traits").map(String::as_str),
            Some("Loggable")
        );
    }
}
