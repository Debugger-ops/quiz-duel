import { io } from 'socket.io-client'
import { getToken, serverUrl } from './api.js'

let socket = null

// One shared connection for the whole session.
export function getSocket() {
  if (!socket) socket = io(serverUrl(), { auth: (cb) => cb({ token: getToken() }) })
  return socket
}

export function closeSocket() {
  if (socket) socket.disconnect()
  socket = null
}
