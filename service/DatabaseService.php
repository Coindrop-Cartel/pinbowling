<?php

namespace App\Service;

use PDO;

/**
 * Service wrapper around the PHP Data Objects (PDO) extension.
 * Provides unified database access, query preparation, execution, and transaction control.
 */
class DatabaseService {
    private PDO $pdo;

    /**
     * DatabaseService constructor.
     *
     * @param PDO $pdo The underlying PDO database connection instance.
     */
    public function __construct(PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Retrieve the raw PDO connection instance.
     * @deprecated Use the delegated methods directly on DatabaseService instead (e.g. $db->prepare()).
     *
     * @return PDO The underlying PDO connection instance.
     */
    public function getPdo(): PDO {
        return $this->pdo;
    }

    /**
     * Delegate any unrecognized method calls directly to the underlying PDO connection.
     * This makes DatabaseService a drop-in proxy for PDO, allowing services to call
     * PDO methods directly on DatabaseService (e.g., $this->db->prepare(...)) without
     * needing to bypass it via getPdo().
     */
    public function __call(string $name, array $arguments) {
        return call_user_func_array([$this->pdo, $name], $arguments);
    }

    /**
     * Helper method to prepare and execute an SQL statement.
     *
     * @param string $sql The SQL query string.
     * @param array $params Optional parameter bindings.
     * @return \PDOStatement The executed statement object.
     */
    public function query(string $sql, array $params = []) {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * Start a new transaction context.
     *
     * @return bool True on success, false on failure.
     */
    public function beginTransaction(): bool {
        return $this->pdo->beginTransaction();
    }

    /**
     * Commit the current transaction context.
     *
     * @return bool True on success, false on failure.
     */
    public function commit(): bool {
        return $this->pdo->commit();
    }

    /**
     * Rollback the current transaction context.
     *
     * @return bool True on success, false on failure.
     */
    public function rollBack(): bool {
        return $this->pdo->rollBack();
    }

    /**
     * Get the last inserted ID.
     *
     * @return string The ID of the last inserted row.
     */
    public function lastInsertId() {
        return $this->pdo->lastInsertId();
    }

    /**
     * Check if a transaction is currently active.
     *
     * @return bool True if currently inside a transaction, false otherwise.
     */
    public function inTransaction(): bool {
        return $this->pdo->inTransaction();
    }
}
