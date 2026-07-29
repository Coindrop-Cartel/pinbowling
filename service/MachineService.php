<?php

namespace App\Service;

/**
 * Service managing the master registry of pinball machines and target score thresholds.
 */
class MachineService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all master machines.
     *
     * @return array
     */
    public function getAllMachines(): array {
        $stmt = $this->db->query(
            'SELECT m.id, m.machine_name, m.year, m.manufacturer, ms.format, ms.target_easy, ms.target_med, ms.target_hard
             FROM machines m
             LEFT JOIN machine_scores ms ON ms.machine_id = m.id
             ORDER BY m.machine_name ASC'
        );
        return $stmt->fetchAll();
    }

    /**
     * Get a specific machine.
     *
     * @param int $machineId
     * @return array
     */
    public function getMachine(int $machineId): array {
        $stmt = $this->db->query(
            'SELECT m.id, m.machine_name, m.year, m.manufacturer, ms.format, ms.target_easy, ms.target_med, ms.target_hard
             FROM machines m
             LEFT JOIN machine_scores ms ON ms.machine_id = m.id
             WHERE m.id = ?',
            [$machineId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Save machine scores helper.
     *
     * @param int $machineId
     * @param array $scores
     */
    public function saveMachineScores(int $machineId, array $scores): void {
        $pdo = $this->db;
        foreach ($scores as $format => $targets) {
            $easy = (int)($targets['targetEasy'] ?? $targets['target_easy'] ?? 0);
            $med = (int)($targets['targetMed'] ?? $targets['target_med'] ?? 0);
            $hard = (int)($targets['targetHard'] ?? $targets['target_hard'] ?? 0);
            
            $stmt = $pdo->prepare(
                'INSERT INTO machine_scores (machine_id, format, target_easy, target_med, target_hard)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE target_easy = VALUES(target_easy), target_med = VALUES(target_med), target_hard = VALUES(target_hard)'
            );
            $stmt->execute([$machineId, $format, $easy, $med, $hard]);
        }
    }

    /**
     * Create a new machine.
     *
     * @param string $machineName
     * @param int|null $year
     * @param string|null $manufacturer
     * @param array|null $scores Optional baseline target scores
     * @return array Created machine
     */
    public function createMachine(string $machineName, ?int $year = null, ?string $manufacturer = null, ?array $scores = null): array {
        $pdo = $this->db;
        
        $stmt = $pdo->prepare(
            'INSERT INTO machines (machine_name, year, manufacturer) VALUES (?, ?, ?)'
        );
        $stmt->execute([$machineName, $year, $manufacturer]);
        $machineId = (int)$pdo->lastInsertId();
        
        if ($scores) {
            $this->saveMachineScores($machineId, $scores);
        }
        
        return $this->getMachine($machineId);
    }

    /**
     * Update a machine.
     *
     * @param int $machineId
     * @param string|null $machineName
     * @param int|null $year
     * @param string|null $manufacturer
     * @param array|null $scores Optional baseline target scores
     * @return array Updated machine
     */
    public function updateMachine(int $machineId, ?string $machineName = null, ?int $year = null, ?string $manufacturer = null, ?array $scores = null): array {
        $pdo = $this->db;
        
        $fields = [];
        $params = [];
        
        if ($machineName !== null) {
            $fields[] = 'machine_name = ?';
            $params[] = $machineName;
        }
        if ($year !== null) {
            $fields[] = 'year = ?';
            $params[] = $year;
        }
        if ($manufacturer !== null) {
            $fields[] = 'manufacturer = ?';
            $params[] = $manufacturer;
        }
        
        if (!empty($fields)) {
            $params[] = $machineId;
            $sql = "UPDATE machines SET " . implode(", ", $fields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }
        
        if ($scores !== null) {
            $this->saveMachineScores($machineId, $scores);
        }
        
        return $this->getMachine($machineId);
    }

    /**
     * Delete a machine.
     *
     * @param int $machineId
     * @return bool
     */
    public function deleteMachine(int $machineId): bool {
        $pdo = $this->db;
        
        try {
            $pdo->beginTransaction();
            
            // Delete target scores for this machine
            $stmt = $pdo->prepare('DELETE FROM target_scores WHERE machine_id = ?');
            $stmt->execute([$machineId]);
            
            // Delete location machines
            $stmt = $pdo->prepare('DELETE FROM location_machines WHERE machine_id = ?');
            $stmt->execute([$machineId]);
            
            // Delete scores for this machine
            $stmt = $pdo->prepare('DELETE FROM scores WHERE machine_id = ?');
            $stmt->execute([$machineId]);
            
            // Finally delete the machine
            $stmt = $pdo->prepare('DELETE FROM machines WHERE id = ?');
            $result = $stmt->execute([$machineId]);
            
            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Get target scores for an event.
     *
     * @param int $eventId
     * @return array
     */
    public function getEventTargetScores(int $eventId): array {
        $stmt = $this->db->query(
            'SELECT ts.*, m.machine_name 
             FROM target_scores ts 
             JOIN machines m ON ts.machine_id = m.id 
             WHERE ts.event_id = ? 
             ORDER BY ts.order_number ASC',
            [$eventId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get target scores for a league.
     *
     * @param int $leagueId
     * @return array
     */
    public function getLeagueTargetScores(int $leagueId): array {
        $stmt = $this->db->query(
            'SELECT ts.*, m.machine_name 
             FROM target_scores ts 
             JOIN machines m ON ts.machine_id = m.id 
             JOIN events e ON ts.event_id = e.id
             WHERE e.league_id = ? 
             ORDER BY ts.event_id ASC, ts.order_number ASC',
            [$leagueId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Create or update target scores for an event.
     *
     * @param int $eventId
     * @param array $targets Array of target score data
     * @return bool
     */
    public function saveTargetScores(int $eventId, array $targets): bool {
        $pdo = $this->db;

        // Support a single target object or a batch array
        if (isset($targets['machineId'])) {
            $targets = [$targets];
        }

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                'INSERT INTO target_scores
                    (event_id, machine_id, order_number, value1, value2,
                     score1, score2, score3, score4, score5,
                     score6, score7, score8, score9, score10)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    machine_id   = VALUES(machine_id),
                    value1       = VALUES(value1),
                    value2       = VALUES(value2),
                    score1       = VALUES(score1),  score2  = VALUES(score2),
                    score3       = VALUES(score3),  score4  = VALUES(score4),
                    score5       = VALUES(score5),  score6  = VALUES(score6),
                    score7       = VALUES(score7),  score8  = VALUES(score8),
                    score9       = VALUES(score9),  score10 = VALUES(score10)'
            );

            foreach ($targets as $target) {
                $values = $target['values'] ?? [];
                $stmt->execute([
                    $target['eventId']     ?? $eventId,
                    $target['machineId'],
                    $target['orderNumber'],
                    $target['value1']      ?? 0,
                    $target['value2']      ?? 0,
                    $values[1]  ?? $values['1']  ?? 0,
                    $values[2]  ?? $values['2']  ?? 0,
                    $values[3]  ?? $values['3']  ?? 0,
                    $values[4]  ?? $values['4']  ?? 0,
                    $values[5]  ?? $values['5']  ?? 0,
                    $values[6]  ?? $values['6']  ?? 0,
                    $values[7]  ?? $values['7']  ?? 0,
                    $values[8]  ?? $values['8']  ?? 0,
                    $values[9]  ?? $values['9']  ?? 0,
                    $values[10] ?? $values['10'] ?? 0,
                ]);
            }

            $pdo->commit();
            return true;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Reorder target scores for an event.
     *
     * @param array $updates Array of [id => order_number] updates
     * @return bool
     */
    public function reorderTargetScores(array $updates): bool {
        if (empty($updates)) {
            return true;
        }

        $pdo = $this->db;
        
        try {
            $pdo->beginTransaction();
            
            $firstItem = reset($updates);
            $firstId = (int)($firstItem['id'] ?? 0);

            if ($firstId > 0) {
                // Shift all to temporary high numbers to avoid unique constraint violations
                $stmt = $pdo->prepare('SELECT event_id FROM target_scores WHERE id = ? LIMIT 1');
                $stmt->execute([$firstId]);
                $eventId = $stmt->fetchColumn();

                if ($eventId) {
                    $highNum = 10000;
                    $stmt = $pdo->prepare('UPDATE target_scores SET order_number = ? WHERE event_id = ?');
                    $stmt->execute([$highNum, $eventId]);
                }
            }
            
            // Now set to correct numbers
            $updateStmt = $pdo->prepare('UPDATE target_scores SET order_number = ? WHERE id = ?');
            foreach ($updates as $update) {
                $orderNum = $update['orderNumber'] ?? $update['order_number'] ?? 0;
                $targetId = $update['id'] ?? 0;
                if ($targetId > 0) {
                    $updateStmt->execute([$orderNum, $targetId]);
                }
            }
            
            $pdo->commit();
            return true;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Delete target scores for an event.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEventTargetScores(int $eventId): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?');
        return $stmt->execute([$eventId]);
    }
}
