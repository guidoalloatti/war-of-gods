#!/usr/bin/env bash
# War of Gods — Server & Client management script
# Usage: ./run.sh start | stop | status | restart

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_PID_FILE="$SCRIPT_DIR/.server.pid"
SERVER_LOG_FILE="$SCRIPT_DIR/.server.log"
CLIENT_PID_FILE="$SCRIPT_DIR/.client.pid"
CLIENT_LOG_FILE="$SCRIPT_DIR/.client.log"
SERVER_PORT=3001
CLIENT_PORT=5173
# Stale Vite instances often grab nearby ports — kill them on start
STALE_VITE_PORTS=(5174 5175 5176 5177 5178)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

get_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    cat "$pid_file"
  fi
}

get_port_pid() {
  lsof -i :"$1" -t 2>/dev/null | head -1
}

is_port_running() {
  local port="$1"
  local pid_file="$2"
  local pid
  pid=$(get_pid "$pid_file")
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  if lsof -i :"$port" -t &>/dev/null; then
    return 0
  fi
  return 1
}

# Free a port by killing whatever occupies it
free_port() {
  local port="$1"
  local pids
  pids=$(lsof -i :"$port" -t 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo -e "${YELLOW}Port $port is occupied — freeing it...${NC}"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    # Force-kill stragglers
    pids=$(lsof -i :"$port" -t 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  fi
}

stop_process() {
  local name="$1"
  local port="$2"
  local pid_file="$3"
  local pid
  pid=$(get_pid "$pid_file")

  if [[ -z "$pid" ]]; then
    pid=$(get_port_pid "$port")
  fi

  if [[ -z "$pid" ]]; then
    echo -e "${YELLOW}$name is not running${NC}"
    rm -f "$pid_file"
    return 0
  fi

  echo -e "${CYAN}Stopping $name (PID: $pid)...${NC}"
  kill "$pid" 2>/dev/null || true

  local count=0
  while kill -0 "$pid" 2>/dev/null && [[ $count -lt 5 ]]; do
    sleep 1
    ((count++))
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${YELLOW}Forcing shutdown...${NC}"
    kill -9 "$pid" 2>/dev/null || true
  fi

  # Clean up anything still on the port
  local port_pid
  port_pid=$(get_port_pid "$port")
  if [[ -n "$port_pid" ]]; then
    kill "$port_pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  echo -e "${GREEN}$name stopped${NC}"
}

kill_stale_vite() {
  for port in "${STALE_VITE_PORTS[@]}"; do
    local stale_pids
    stale_pids=$(lsof -i :"$port" -t 2>/dev/null || true)
    if [[ -n "$stale_pids" ]]; then
      echo -e "${YELLOW}Killing stale process on port $port...${NC}"
      echo "$stale_pids" | xargs kill 2>/dev/null || true
    fi
  done
}

do_start() {
  kill_stale_vite

  # ── Prerequisites ──
  if ! command -v pnpm &>/dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    echo "  Install: npm install -g pnpm"
    exit 1
  fi

  if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    cd "$SCRIPT_DIR" && pnpm install
  fi

  cd "$SCRIPT_DIR"

  # ── Server (backend) ──
  if is_port_running "$SERVER_PORT" "$SERVER_PID_FILE"; then
    local spid
    spid=$(get_pid "$SERVER_PID_FILE")
    [[ -z "$spid" ]] && spid=$(get_port_pid "$SERVER_PORT")
    echo -e "${YELLOW}Server already running${NC} (PID: $spid, port $SERVER_PORT)"
  else
    free_port "$SERVER_PORT"
    echo -e "${CYAN}Starting server...${NC}"
    nohup pnpm --filter @war-of-gods/server dev > "$SERVER_LOG_FILE" 2>&1 &
    local spid=$!
    echo "$spid" > "$SERVER_PID_FILE"
    sleep 2
    if kill -0 "$spid" 2>/dev/null; then
      echo -e "${GREEN}Server started${NC} (PID: $spid, port $SERVER_PORT)"
    else
      echo -e "${RED}Server failed to start${NC} — check $SERVER_LOG_FILE"
      rm -f "$SERVER_PID_FILE"
    fi
  fi

  # ── Client (Vite) ──
  if is_port_running "$CLIENT_PORT" "$CLIENT_PID_FILE"; then
    local cpid
    cpid=$(get_pid "$CLIENT_PID_FILE")
    [[ -z "$cpid" ]] && cpid=$(get_port_pid "$CLIENT_PORT")
    echo -e "${YELLOW}Client already running${NC} (PID: $cpid, port $CLIENT_PORT)"
  else
    free_port "$CLIENT_PORT"
    echo -e "${CYAN}Starting client...${NC}"
    nohup pnpm --filter @war-of-gods/client dev > "$CLIENT_LOG_FILE" 2>&1 &
    local cpid=$!
    echo "$cpid" > "$CLIENT_PID_FILE"
    sleep 3
    if kill -0 "$cpid" 2>/dev/null; then
      echo -e "${GREEN}Client started${NC} (PID: $cpid, port $CLIENT_PORT)"
    else
      echo -e "${RED}Client failed to start${NC} — check $CLIENT_LOG_FILE"
      rm -f "$CLIENT_PID_FILE"
    fi
  fi

  echo ""
  echo -e "${GREEN}War of Gods is running:${NC}"
  echo -e "  Client: ${CYAN}http://localhost:$CLIENT_PORT${NC}"
  echo -e "  Server: ${CYAN}http://localhost:$SERVER_PORT${NC}"
  echo -e "  Logs:   ${CYAN}$SERVER_LOG_FILE${NC}"
  echo -e "          ${CYAN}$CLIENT_LOG_FILE${NC}"
}

do_stop() {
  stop_process "Client" "$CLIENT_PORT" "$CLIENT_PID_FILE"
  stop_process "Server" "$SERVER_PORT" "$SERVER_PID_FILE"
  kill_stale_vite
}

do_status() {
  # Server
  if is_port_running "$SERVER_PORT" "$SERVER_PID_FILE"; then
    local spid
    spid=$(get_pid "$SERVER_PID_FILE")
    [[ -z "$spid" ]] && spid=$(get_port_pid "$SERVER_PORT")
    echo -e "${GREEN}Server is running${NC} (PID: $spid, port $SERVER_PORT)"
  else
    echo -e "${YELLOW}Server is not running${NC}"
    rm -f "$SERVER_PID_FILE"
  fi

  # Client
  if is_port_running "$CLIENT_PORT" "$CLIENT_PID_FILE"; then
    local cpid
    cpid=$(get_pid "$CLIENT_PID_FILE")
    [[ -z "$cpid" ]] && cpid=$(get_port_pid "$CLIENT_PORT")
    echo -e "${GREEN}Client is running${NC} (PID: $cpid, port $CLIENT_PORT)"
  else
    echo -e "${YELLOW}Client is not running${NC}"
    rm -f "$CLIENT_PID_FILE"
  fi
}

do_restart() {
  set +e
  do_stop
  set -e
  sleep 1
  do_start
}

# Main
case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  status)  do_status ;;
  restart) do_restart ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    echo ""
    echo "Commands:"
    echo "  start    Start server (port $SERVER_PORT) and client (port $CLIENT_PORT)"
    echo "  stop     Stop both server and client"
    echo "  status   Check if server and client are running"
    echo "  restart  Stop and start both"
    exit 1
    ;;
esac
