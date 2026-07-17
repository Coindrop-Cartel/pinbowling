<?php
/**
 * migrate-targets.php
 * 
 * Copies machine_scores and location_machine_scores setup for bowling to also exist for golf.
 * 
 * Usage: php migrate-targets.php
 */

require_once __DIR__ . '/../includes/config.php';

function migrateTargets() {
    try {
        $pdo = getDbConnection();
        echo "Connected to database successfully.\n";

        // Start transaction
        $pdo->beginTransaction();

        // 1. Copy machine_scores from bowling to golf
        echo "Migrating machine_scores from bowling to golf...\n";
        
        $stmt = $pdo->query("SELECT machine_id, target_easy, target_med, target_hard FROM machine_scores WHERE format = 'bowling'");
        $bowlingMachineScores = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $msInserted = 0;
        $msSkipped = 0;
        
        $insertMsStmt = $pdo->prepare("
            INSERT INTO machine_scores (machine_id, format, target_easy, target_med, target_hard)
            VALUES (:machine_id, 'golf', :target_easy, :target_med, :target_hard)
        ");
        
        foreach ($bowlingMachineScores as $row) {
            $checkStmt = $pdo->prepare("SELECT 1 FROM machine_scores WHERE machine_id = ? AND format = 'golf'");
            $checkStmt->execute([$row['machine_id']]);
            if (!$checkStmt->fetch()) {
                $insertMsStmt->execute([
                    ':machine_id' => $row['machine_id'],
                    ':target_easy' => $row['target_easy'],
                    ':target_med' => $row['target_med'],
                    ':target_hard' => $row['target_hard']
                ]);
                $msInserted++;
            } else {
                $msSkipped++;
            }
        }
        
        echo "✓ Machine scores: $msInserted copied, $msSkipped already existed.\n";

        // 2. Copy location_machine_scores from bowling to golf
        echo "Migrating location_machine_scores from bowling to golf...\n";
        
        $stmt = $pdo->query("SELECT location_machine_id, target_easy, target_med, target_hard FROM location_machine_scores WHERE format = 'bowling'");
        $bowlingLocationScores = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        $lmsInserted = 0;
        $lmsSkipped = 0;
        
        $insertLmsStmt = $pdo->prepare("
            INSERT INTO location_machine_scores (location_machine_id, format, target_easy, target_med, target_hard)
            VALUES (:location_machine_id, 'golf', :target_easy, :target_med, :target_hard)
        ");
        
        foreach ($bowlingLocationScores as $row) {
            $checkStmt = $pdo->prepare("SELECT 1 FROM location_machine_scores WHERE location_machine_id = ? AND format = 'golf'");
            $checkStmt->execute([$row['location_machine_id']]);
            if (!$checkStmt->fetch()) {
                $insertLmsStmt->execute([
                    ':location_machine_id' => $row['location_machine_id'],
                    ':target_easy' => $row['target_easy'],
                    ':target_med' => $row['target_med'],
                    ':target_hard' => $row['target_hard']
                ]);
                $lmsInserted++;
            } else {
                $lmsSkipped++;
            }
        }
        
        echo "✓ Location machine scores: $lmsInserted copied, $lmsSkipped already existed.\n";

        // Commit transaction
        $pdo->commit();
        echo "\nTarget scores migration completed successfully!\n";

    } catch (PDOException $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo "\nDatabase Error: " . $e->getMessage() . "\n";
        exit(1);
    } catch (Exception $e) {
        if (isset($pdo) && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        echo "\nError: " . $e->getMessage() . "\n";
        exit(1);
    }
}

migrateTargets();
