<?php

namespace App\Service;

/**
 * Service managing locations (venues) and the association of pinball machines with specific locations.
 */
class LocationService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all locations with their machines.
     *
     * @return array
     */
    public function getAllLocations(): array {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->query('SELECT * FROM locations ORDER BY name ASC');
        $locations = $stmt->fetchAll();

        $machinesStmt = $pdo->query(
            "SELECT lm.*, m.machine_name,
                    COALESCE(NULLIF(lms.target_easy, 0), ms.target_easy, 0) AS target_easy,
                    COALESCE(NULLIF(lms.target_med, 0), ms.target_med, 0) AS target_med,
                    COALESCE(NULLIF(lms.target_hard, 0), ms.target_hard, 0) AS target_hard,
                    COALESCE(lms.format, ms.format, 'bowling') AS format
             FROM location_machines lm 
             JOIN machines m ON lm.machine_id = m.id 
             LEFT JOIN location_machine_scores lms ON lms.location_machine_id = lm.id
             LEFT JOIN machine_scores ms ON ms.machine_id = lm.machine_id AND ms.format = COALESCE(lms.format, 'bowling')
             ORDER BY lm.location_id ASC"
        );
        $allMachines = $machinesStmt->fetchAll();

        $machinesByLocation = [];
        foreach ($allMachines as $mach) {
            $machinesByLocation[(int)$mach['location_id']][] = $mach;
        }

        foreach ($locations as &$loc) {
            $loc['machines'] = $machinesByLocation[(int)$loc['id']] ?? [];
        }

        return $locations;
    }

    /**
     * Get a specific location with its machines.
     *
     * @param int $locationId
     * @return array|false
     */
    public function getLocation(int $locationId) {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare('SELECT * FROM locations WHERE id = ?');
        $stmt->execute([$locationId]);
        $location = $stmt->fetch();
        
        if (!$location) {
            return false;
        }

        $stmt = $pdo->prepare(
            "SELECT lm.*, m.machine_name,
                    COALESCE(NULLIF(lms.target_easy, 0), ms.target_easy, 0) AS target_easy,
                    COALESCE(NULLIF(lms.target_med, 0), ms.target_med, 0) AS target_med,
                    COALESCE(NULLIF(lms.target_hard, 0), ms.target_hard, 0) AS target_hard,
                    COALESCE(lms.format, ms.format, 'bowling') AS format
             FROM location_machines lm 
             JOIN machines m ON lm.machine_id = m.id 
             LEFT JOIN location_machine_scores lms ON lms.location_machine_id = lm.id
             LEFT JOIN machine_scores ms ON ms.machine_id = lm.machine_id AND ms.format = COALESCE(lms.format, 'bowling')
             WHERE lm.location_id = ?"
        );
        $stmt->execute([$locationId]);
        $location['machines'] = $stmt->fetchAll();

        return $location;
    }

    /**
     * Get machines at a specific location.
     *
     * @param int|null $locationId Optional location filter
     * @return array
     */
    public function getLocationMachines(?int $locationId = null): array {
        $pdo = $this->db->getPdo();
        
        if ($locationId) {
            $stmt = $pdo->prepare(
                "SELECT lm.*, m.machine_name,
                        COALESCE(NULLIF(lms.target_easy, 0), ms.target_easy, 0) AS target_easy,
                        COALESCE(NULLIF(lms.target_med, 0), ms.target_med, 0) AS target_med,
                        COALESCE(NULLIF(lms.target_hard, 0), ms.target_hard, 0) AS target_hard,
                        COALESCE(lms.format, ms.format, 'bowling') AS format
                 FROM location_machines lm 
                 JOIN machines m ON lm.machine_id = m.id 
                 LEFT JOIN location_machine_scores lms ON lms.location_machine_id = lm.id
                 LEFT JOIN machine_scores ms ON ms.machine_id = lm.machine_id AND ms.format = COALESCE(lms.format, 'bowling')
                 WHERE lm.location_id = ?"
            );
            $stmt->execute([$locationId]);
        } else {
            $stmt = $pdo->query(
                "SELECT lm.*, m.machine_name,
                        COALESCE(NULLIF(lms.target_easy, 0), ms.target_easy, 0) AS target_easy,
                        COALESCE(NULLIF(lms.target_med, 0), ms.target_med, 0) AS target_med,
                        COALESCE(NULLIF(lms.target_hard, 0), ms.target_hard, 0) AS target_hard,
                        COALESCE(lms.format, ms.format, 'bowling') AS format
                 FROM location_machines lm 
                 JOIN machines m ON lm.machine_id = m.id 
                 LEFT JOIN location_machine_scores lms ON lms.location_machine_id = lm.id
                 LEFT JOIN machine_scores ms ON ms.machine_id = lm.machine_id AND ms.format = COALESCE(lms.format, 'bowling')
                 ORDER BY lm.location_id ASC"
            );
        }
        
        return $stmt->fetchAll();
    }

    /**
     * Create a new location.
     *
     * @param string $name
     * @param string|null $address
     * @param string|null $city
     * @param string|null $state
     * @return array Created location data
     */
    public function createLocation(string $name, ?string $city = null, ?string $state = null): array {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare(
            'INSERT INTO locations (name, city, state) VALUES (?, ?, ?)'
        );
        $stmt->execute([$name, $city, $state]);
        
        return $this->getLocation((int)$pdo->lastInsertId());
    }

    /**
     * Update a location.
     *
     * @param int $locationId
     * @param array $data
     * @return array Updated location
     */
    public function updateLocation(int $locationId, array $data): array {
        $pdo = $this->db->getPdo();
        $allowed = ['name', 'city', 'state'];
        
        $fields = [];
        $params = [];
        
        foreach ($data as $key => $value) {
            if (in_array($key, $allowed)) {
                $fields[] = "$key = ?";
                $params[] = $value;
            }
        }
        
        if (!empty($fields)) {
            $params[] = $locationId;
            $sql = "UPDATE locations SET " . implode(", ", $fields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }
        
        return $this->getLocation($locationId);
    }

    /**
     * Delete a location.
     *
     * @param int $locationId
     * @return bool
     */
    public function deleteLocation(int $locationId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            // Delete location machines first
            $stmt = $pdo->prepare('DELETE FROM location_machines WHERE location_id = ?');
            $stmt->execute([$locationId]);
            
            // Delete the location
            $stmt = $pdo->prepare('DELETE FROM locations WHERE id = ?');
            $result = $stmt->execute([$locationId]);
            
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
     * Add a machine to a location.
     *
     * @param int $locationId
     * @param int $machineId
     * @param array $data Optional extra fields (target_easy, target_med, target_hard, etc.)
     * @return bool
     */
    public function addMachineToLocation(int $locationId, int $machineId, array $data = []): bool {
        $pdo = $this->db->getPdo();
        $allowed = ['note'];

        $cols = ['location_id', 'machine_id'];
        $placeholders = ['?', '?'];
        $params = [$locationId, $machineId];

        foreach ($data as $key => $value) {
            if (in_array($key, $allowed)) {
                $cols[] = "`$key`";
                $placeholders[] = '?';
                $params[] = $value;
            }
        }

        $sql = 'INSERT INTO location_machines (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $placeholders) . ')';
        $stmt = $pdo->prepare($sql);
        $result = $stmt->execute($params);

        if ($result) {
            $locationMachineId = (int)$pdo->lastInsertId();
            $format = $data['format'] ?? 'bowling';
            $targetEasy = (int)($data['target_easy'] ?? 0);
            $targetMed = (int)($data['target_med'] ?? 0);
            $targetHard = (int)($data['target_hard'] ?? 0);

            $scoreStmt = $pdo->prepare(
                'INSERT INTO location_machine_scores (location_machine_id, format, target_easy, target_med, target_hard) VALUES (?, ?, ?, ?, ?)'
            );
            $scoreStmt->execute([$locationMachineId, $format, $targetEasy, $targetMed, $targetHard]);
        }

        return $result;
    }

    /**
     * Update target scores for a machine at a location.
     *
     * @param int $locationId
     * @param int $machineId
     * @param array $data
     * @return bool
     */
    public function updateLocationMachine(int $locationId, int $machineId, array $data): bool {
        $pdo = $this->db->getPdo();
        $allowed = ['note'];

        $fields = [];
        $params = [];
        foreach ($data as $key => $value) {
            if (in_array($key, $allowed)) {
                $fields[] = "`$key` = ?";
                $params[] = $value;
            }
        }

        if (!empty($fields)) {
            $params[] = $locationId;
            $params[] = $machineId;
            $sql = "UPDATE location_machines SET " . implode(', ', $fields) . " WHERE location_id = ? AND machine_id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }

        // Upsert scores into location_machine_scores
        $format = $data['format'] ?? 'bowling';
        $targetEasy = (int)($data['target_easy'] ?? 0);
        $targetMed = (int)($data['target_med'] ?? 0);
        $targetHard = (int)($data['target_hard'] ?? 0);

        $idStmt = $pdo->prepare('SELECT id FROM location_machines WHERE location_id = ? AND machine_id = ?');
        $idStmt->execute([$locationId, $machineId]);
        $lmRow = $idStmt->fetch();
        if ($lmRow) {
            $locationMachineId = (int)$lmRow['id'];
            $scoreStmt = $pdo->prepare(
                'INSERT INTO location_machine_scores (location_machine_id, format, target_easy, target_med, target_hard) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE target_easy = VALUES(target_easy), target_med = VALUES(target_med), target_hard = VALUES(target_hard)'
            );
            $scoreStmt->execute([$locationMachineId, $format, $targetEasy, $targetMed, $targetHard]);
        }

        return true;
    }

    /**
     * Remove a machine from a location.
     *
     * @param int $locationId
     * @param int $machineId
     * @return bool
     */
    public function removeMachineFromLocation(int $locationId, int $machineId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM location_machines WHERE location_id = ? AND machine_id = ?');
        return $stmt->execute([$locationId, $machineId]);
    }
}
