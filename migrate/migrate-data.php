<?php
/**
 * migrate-data.php
 * 
 * This script executes the data migration logic defined in migration_steps.sql.
 * It handles 'source' directives by inlining the contents of the referenced SQL files,
 * as PDO does not support the MariaDB/MySQL 'source' command.
 * 
 * Usage: php migrate-data.php
 */

require_once __DIR__ . '/../includes/config.php';

/**
 * Split a SQL script into individual statements, respecting:
 *   - single-quoted strings ('...') with \' and '' escapes
 *   - double-quoted strings/identifiers ("...") with \" and "" escapes
 *   - backtick-quoted identifiers (`...`) with `` escape
 *   - line comments (-- to end of line, and # to end of line)
 *   - block comments (/* ... *​/ can span multiple lines)
 *
 * A statement terminator is a semicolon that appears outside of any
 * quoted string or comment. Statements are returned with their comments
 * stripped of leading/trailing whitespace but otherwise intact.
 *
 * @return array<string> List of SQL statements (may include comment-only fragments).
 */
function splitSqlStatements(string $sql): array {
    $statements = [];
    $length = strlen($sql);
    $current = '';
    $i = 0;

    while ($i < $length) {
        $char = $sql[$i];
        $next = ($i + 1 < $length) ? $sql[$i + 1] : '';

        // Line comment: -- (must not be part of a longer token; require whitespace or EOL after)
        if ($char === '-' && $next === '-') {
            // Consume until end of line
            $end = strpos($sql, "\n", $i);
            if ($end === false) {
                $current .= substr($sql, $i);
                $i = $length;
            } else {
                $current .= substr($sql, $i, $end - $i + 1);
                $i = $end + 1;
            }
            continue;
        }

        // Line comment: # to end of line
        if ($char === '#') {
            $end = strpos($sql, "\n", $i);
            if ($end === false) {
                $current .= substr($sql, $i);
                $i = $length;
            } else {
                $current .= substr($sql, $i, $end - $i + 1);
                $i = $end + 1;
            }
            continue;
        }

        // Block comment: /* ... */
        if ($char === '/' && $next === '*') {
            $end = strpos($sql, '*/', $i + 2);
            if ($end === false) {
                $current .= substr($sql, $i);
                $i = $length;
            } else {
                $current .= substr($sql, $i, $end - $i + 2);
                $i = $end + 2;
            }
            continue;
        }

        // Single-quoted string
        if ($char === "'") {
            $current .= $char;
            $i++;
            while ($i < $length) {
                $c = $sql[$i];
                $current .= $c;
                $i++;
                if ($c === '\\' && $i < $length) {
                    // Escape: keep the next char literally
                    $current .= $sql[$i];
                    $i++;
                    continue;
                }
                if ($c === "'") {
                    // Check for '' escape (doubled quote)
                    if ($i < $length && $sql[$i] === "'") {
                        $current .= $sql[$i];
                        $i++;
                        continue;
                    }
                    break;
                }
            }
            continue;
        }

        // Double-quoted string/identifier
        if ($char === '"') {
            $current .= $char;
            $i++;
            while ($i < $length) {
                $c = $sql[$i];
                $current .= $c;
                $i++;
                if ($c === '\\' && $i < $length) {
                    $current .= $sql[$i];
                    $i++;
                    continue;
                }
                if ($c === '"') {
                    if ($i < $length && $sql[$i] === '"') {
                        $current .= $sql[$i];
                        $i++;
                        continue;
                    }
                    break;
                }
            }
            continue;
        }

        // Backtick-quoted identifier
        if ($char === '`') {
            $current .= $char;
            $i++;
            while ($i < $length) {
                $c = $sql[$i];
                $current .= $c;
                $i++;
                if ($c === '`') {
                    if ($i < $length && $sql[$i] === '`') {
                        $current .= $sql[$i];
                        $i++;
                        continue;
                    }
                    break;
                }
            }
            continue;
        }

        // Statement terminator: semicolon outside quotes/comments
        if ($char === ';') {
            $current .= $char;
            $statements[] = $current;
            $current = '';
            $i++;
            continue;
        }

        $current .= $char;
        $i++;
    }

    // Append any trailing content (e.g., a final statement without a semicolon)
    if (trim($current) !== '') {
        $statements[] = $current;
    }

    return $statements;
}

function migrateData() {
    try {
        $pdo = getDbConnection();
        echo "Connected to database successfully.\n";

        $sqlFile = __DIR__ . '/migration_steps.sql';
        if (!file_exists($sqlFile)) {
            throw new Exception("Migration file not found: $sqlFile");
        }

        echo "Reading migration steps from $sqlFile...\n";
        $sqlContent = file_get_contents($sqlFile);

        // Handle 'source' directives by inlining the file contents
        // Pattern: source filename.sql;
        $sqlContent = preg_replace_callback(
            '/source\s+([a-zA-Z0-9_\-\.]+)\.sql\s*;/',
            function ($matches) {
                $filename = $matches[1] . '.sql';
                $filePath = __DIR__ . '/' . $filename;
                if (file_exists($filePath)) {
                    echo "Inlining $filename...\n";
                    return file_get_contents($filePath);
                } else {
                    throw new Exception("Source file not found: $filePath");
                }
            },
            $sqlContent
        );

        // Split SQL into individual statements using a proper parser
        // that respects single-quoted strings, double-quoted identifiers,
        // backtick identifiers, line comments (-- and #), and block comments (/* */).
        // A naive explode(';', ...) breaks on semicolons inside comments and strings.
        $statements = splitSqlStatements($sqlContent);

        // Pre-filter: drop empty and comment-only fragments so the total
        // reflects only statements that will actually be executed.
        $executables = [];
        foreach ($statements as $stmt) {
            $trimmedStmt = trim($stmt);
            // Strip leading line comments / whitespace to detect comment-only fragments
            $withoutComments = preg_replace('/^(--[^\n]*\n|\s*#[^\n]*\n|\s*\/\*.*?\*\/\s*)*/s', '', $trimmedStmt);
            if (rtrim($withoutComments, ";\n\r\t ") === '') {
                continue;
            }
            $executables[] = $stmt;
        }

        $total = count($executables);
        echo "Executing $total statements...\n";
        $count = 0;
        foreach ($executables as $stmt) {
            $pdo->exec($stmt);
            $count++;

            // Summarize the statement type for a concise progress line.
            // Strip leading line/block comments so we report the real keyword.
            $stripped = preg_replace('/^(--[^\n]*\n|\s*#[^\n]*\n|\s*\/\*.*?\*\/\s*)*/s', '', ltrim($stmt));
            $firstWord = strtoupper(preg_split('/\s+/', $stripped, 2)[0] ?? '');
            echo "✓ Executed statement $count/$total  ($firstWord)\n";
        }

        echo "\nData migration completed successfully! ($count/$total statements executed)\n";

    } catch (PDOException $e) {
        echo "\nDatabase Error: " . $e->getMessage() . "\n";
        exit(1);
    } catch (Exception $e) {
        echo "\nError: " . $e->getMessage() . "\n";
        exit(1);
    }
}

// Run the migration
migrateData();
