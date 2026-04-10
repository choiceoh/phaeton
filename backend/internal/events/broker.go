package events

import (
	"encoding/json"
	"sync"
)

// SSEMessage is the payload sent to SSE clients.
type SSEMessage struct {
	Type         string `json:"type"`
	CollectionID string `json:"collection_id"`
	RecordID     string `json:"record_id,omitempty"`
	ActorUserID  string `json:"actor_user_id,omitempty"`
	ActorName    string `json:"actor_name,omitempty"`
}

// Broker fans out events to connected SSE clients.
type Broker struct {
	mu      sync.RWMutex
	clients map[chan []byte]struct{}
}

func NewBroker() *Broker {
	return &Broker{
		clients: make(map[chan []byte]struct{}),
	}
}

// Subscribe adds a client channel. Returns a channel the client should read from,
// and an unsubscribe function the caller MUST call when done.
func (b *Broker) Subscribe() (ch <-chan []byte, unsub func()) {
	c := make(chan []byte, 64)
	b.mu.Lock()
	b.clients[c] = struct{}{}
	b.mu.Unlock()
	return c, func() {
		b.mu.Lock()
		delete(b.clients, c)
		b.mu.Unlock()
		// Drain channel to avoid goroutine leaks.
		for range c {
		}
	}
}

// Broadcast sends a message to all connected clients.
// Non-blocking: if a client's buffer is full the message is dropped.
func (b *Broker) Broadcast(msg SSEMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		select {
		case c <- data:
		default:
			// client buffer full, drop message
		}
	}
}

// Close disconnects all SSE clients by closing their channels.
func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	for c := range b.clients {
		close(c)
		delete(b.clients, c)
	}
}

// ClientCount returns the number of connected SSE clients.
func (b *Broker) ClientCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.clients)
}
