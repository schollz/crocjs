package main

import (
	"bytes"
	"flag"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	log "github.com/schollz/logger"
)

var addr = flag.String("addr", ":8080", "http service address")

type hubMap struct {
	h map[string]*Hub
	sync.Mutex
}

var hubs hubMap

func main() {
	flag.Parse()

	hubs.Lock()
	hubs.h = make(map[string]*Hub)
	hubs.Unlock()

	http.HandleFunc("/", serveHome)
	log.Debugf("running on %s", *addr)
	err := http.ListenAndServe(*addr, nil)
	if err != nil {
		log.Error("ListenAndServe: ", err)
	}
}

func serveHome(w http.ResponseWriter, r *http.Request) {
	log.Info(r.URL)
	if r.URL.Path == "/ws" {
		serveWs(w, r)
		return
	}

	urlPath := r.URL.Path
	if r.URL.Path != "/" {
		urlPath = urlPath[1:]
	} else {
		urlPath = "home.html"
	}
	http.ServeFile(w, r, urlPath)
}

// serveWs handles websocket requests from the peer.
func serveWs(w http.ResponseWriter, r *http.Request) {
	rooms, ok := r.URL.Query()["room"]
	room := rooms[0]
	log.Debug(room, ok)

	hubs.Lock()
	defer hubs.Unlock()

	if _, ok = hubs.h[room]; !ok {
		hubs.h[room] = newHub()
	}

	go hubs.h[room].run()

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Info(err)
		return
	}
	client := &Client{hub: hubs.h[room], conn: conn, send: make(chan []byte, 256)}
	client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.writePump()
	go client.readPump()
}

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 4096 * 60
)

var (
	newline = []byte{'\n'}
	space   = []byte{' '}
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	hub *Hub

	// The websocket connection.
	conn *websocket.Conn

	// Buffered channel of outbound messages.
	send chan []byte
}

type Message struct {
	message []byte
	origin  string
}

// readPump pumps messages from the websocket connection to the hub.
//
// The application runs readPump in a per-connection goroutine. The application
// ensures that there is at most one reader on a connection by executing all
// reads from this goroutine.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
		log.Debug("readPump closed")
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Error(err)
			}
			break
		}
		message = bytes.TrimSpace(bytes.Replace(message, newline, space, -1))
		c.hub.broadcast <- Message{message, c.conn.RemoteAddr().String()}
	}
}

// writePump pumps messages from the hub to the websocket connection.
//
// A goroutine running writePump is started for each connection. The
// application ensures that there is at most one writer to a connection by
// executing all writes from this goroutine.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
		log.Debug("writePump closed")
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message.
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write(newline)
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// Hub maintains the set of active clients and broadcasts messages to the
// clients.
type Hub struct {
	// Registered clients.
	clients map[*Client]bool

	// Inbound messages from the clients.
	broadcast chan Message

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		broadcast:  make(chan Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
	}
}

func (h *Hub) run() {
	defer func() {
		log.Debug("hub closed")
	}()
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
		case message := <-h.broadcast:
			log.Debugf("message from origin %s", message.origin)
			for client := range h.clients {
				// don't send back to the current
				if client.conn.RemoteAddr().String() == message.origin {
					continue
				}
				select {
				case client.send <- message.message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
		log.Debugf("clients: %d", len(h.clients))
		if len(h.clients) == 0 {
			break
		}
	}
}
