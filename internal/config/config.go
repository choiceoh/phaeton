package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL string
	Port        int
}

func Load() Config {
	port := 8080
	if p, err := strconv.Atoi(os.Getenv("PORT")); err == nil && p > 0 {
		port = p
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/phaeton?sslmode=disable"
	}

	return Config{
		DatabaseURL: dbURL,
		Port:        port,
	}
}
