<?php

namespace App\Includes;

class Container {
    private array $instances = [];
    private array $factories = [];

    public function set(string $id, callable $factory) {
        $this->factories[$id] = $factory;
        unset($this->instances[$id]);
    }

    public function setInstance(string $id, $instance) {
        $this->instances[$id] = $instance;
        unset($this->factories[$id]);
    }

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
