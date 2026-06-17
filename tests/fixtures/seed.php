<?php
/**
 * Database Seeding Runner.
 * 
 * CLI script to populate the database with test data.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo "This script must be run from the command line.\n";
    exit(1);
}

require_once __DIR__ . '/../../includes/config.php';

try {
    $pdo = getDbConnection();
    $seedFile = __DIR__ . '/../fixtures/seed_test_users.sql';

    if (!file_exists($seedFile)) {
        throw new Exception("Seed file not found: $seedFile");
    }

    $sql = file_get_contents($seedFile);
    $pdo->exec($sql);

    echo "✓ Database seeded successfully from tests/fixtures/seed_test_users.sql\n";
} catch (Exception $e) {
    echo "✗ Seeding failed: " . $e->getMessage() . "\n";
    exit(1);
}
