<?php

namespace App\Includes;

/**
 * A lightweight Dependency Injection (DI) Container.
 * Manages service registration, lazy resolution via factories, and singleton instances.
 */
class Container {
    private array $instances = [];
    private array $factories = [];

    /**
     * Register a service factory.
     *
     * @param string $id The service identifier/class name.
     * @param callable $factory A callback function that creates the service instance.
     */
    public function set(string $id, callable $factory) {
        $this->factories[$id] = $factory;
        unset($this->instances[$id]);
    }

    /**
     * Register an instantiated service instance directly.
     *
     * @param string $id The service identifier/class name.
     * @param mixed $instance The pre-instantiated service object.
     */
    public function setInstance(string $id, $instance) {
        $this->instances[$id] = $instance;
        unset($this->factories[$id]);
    }

    /**
     * Retrieve a resolved service instance by its identifier.
     * Lazy-resolves the service if a factory is registered but no instance exists yet.
     *
     * @param string $id The service identifier/class name.
     * @return mixed The resolved service instance.
     * @throws \Exception If the service identifier is not registered.
     */
    public function get(string $id) {
        if (isset($this->instances[$id])) {
            return $this->instances[$id];
        }

        if (isset($this->factories[$id])) {
            $this->instances[$id] = $this->factories[$id]($this);
            return $this->instances[$id];
        }

        throw new \Exception("Service not found: {$id}");
    }
}
