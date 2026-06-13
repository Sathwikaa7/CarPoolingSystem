import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {jwtDecode} from 'jwt-decode';

function LiveSearch({ pickup, drop, pickupCoords, dropCoords, onMatch, onStop, autoStartType, onAutoStartConsumed }) {
  const [isSearching, setIsSearching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [searchType, setSearchType] = useState(null);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [socket, setSocket] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [matchFound, setMatchFound] = useState(null);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [chatRoom, setChatRoom] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [connectionEstablished, setConnectionEstablished] = useState(false);
  const [partnerApproved, setPartnerApproved] = useState(false);
  const [partnerEndedMessage, setPartnerEndedMessage] = useState(null);
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  // Auto-start search when triggered from Dashboard booking buttons
  useEffect(() => {
    if (autoStartType && socketConnected && pickup && drop && pickupCoords && dropCoords && !isSearching) {
      startSearch(autoStartType);
      if (onAutoStartConsumed) onAutoStartConsumed();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartType, socketConnected]);

  // Decode JWT to get current user ID
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      const decoded = jwtDecode(token);
      setCurrentUserId(decoded.id);
    }
  }, []);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Initialize socket connection
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !socketRef.current) {
      console.log('🔌 Initializing socket connection...');
      
      const newSocket = io(process.env.REACT_APP_SOCKET_URL || 'https://carpoolingsystem-production-b904.up.railway.app', {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      newSocket.on('connect', () => {
        console.log('✅ Socket connected');
        setSocketConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setSocketConnected(false);
      });

      newSocket.on('search_started', (data) => {
        console.log('🔍 Search started:', data);
      });

      newSocket.on('instant_match_found', (matchData) => {
        console.log('⚡ Instant match found:', matchData);
        setMatchFound(matchData);
        setWaitingForApproval(false); // Show approval buttons, not waiting state
      });

      newSocket.on('partner_approved', (data) => {
        console.log('👍 Partner approved, waiting for your approval:', data);
        setPartnerApproved(true); // Show that partner approved
      });

      newSocket.on('approval_sent', (data) => {
        console.log('⏳ Your approval sent, waiting for partner:', data);
        setWaitingForApproval(true); // Now show waiting state
      });

      newSocket.on('connection_established', (connectionData) => {
        console.log('🤝 Connection established:', connectionData);
        setChatRoom(connectionData.chatRoomId);
        setConnectionEstablished(true);
        setWaitingForApproval(false);
        setMatchFound(null);
        
        // Join the chat room
        newSocket.emit('join_chat_room', { chatRoomId: connectionData.chatRoomId });
        
        // Add welcome message
        setChatMessages([{
          type: 'system',
          message: `🎉 Connected with ${connectionData.partner.name}! You can now coordinate your ride.`,
          timestamp: new Date()
        }]);
      });

      newSocket.on('match_cancelled', (data) => {
        console.log('🚫 Match cancelled:', data);
        setMatchFound(null);
        setWaitingForApproval(false);
        setConnectionEstablished(false);
        setPartnerApproved(false);
        setChatRoom(null);
        setChatMessages([]);
      });

      newSocket.on('connection_ended', (data) => {
        console.log("CONNECTION ENDED EVENT RECEIVED", data);
        console.log('🔚 Connection ended by partner:', data);
        setPartnerEndedMessage(`${data.userName} ended the connection`);
        setConnectionEstablished(false);
        setChatRoom(null);
        setChatMessages([]);
        setMatchFound(null);
        setWaitingForApproval(false);
        setPartnerApproved(false);
      });

      newSocket.on('chat_message', (messageData) => {
        console.log('💬 Chat message received:', messageData);
        setChatMessages(prev => [...prev, messageData]);
      });

      newSocket.on('match_error', (error) => {
        console.error('❌ Match error:', error);
        alert(`Match error: ${error.message}`);
      });

      newSocket.on('chat_error', (error) => {
        console.error('❌ Chat error:', error);
        alert(`Chat error: ${error.message}`);
      });

      setSocket(newSocket);
      socketRef.current = newSocket;

      return () => {
        console.log('🔌 Cleaning up socket connection');
        newSocket.close();
        socketRef.current = null;
      };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // Start live search
  const startSearch = async (type) => {
    try {
      if (!socket || !socketConnected) {
        alert('Connection not ready. Please wait and try again.');
        return;
      }

      console.log('🔍 Starting search:', { type, pickup, drop });

      setIsSearching(true);
      setSearchType(type);
      setTimeLeft(180);
      setMatchFound(null);
      setWaitingForApproval(false);
      setConnectionEstablished(false);
      setChatRoom(null);
      setChatMessages([]);
      setPartnerEndedMessage(null);

      // Emit search to backend
      socket.emit('start_search', {
        pickup,
        drop,
        pickupCoords,
        dropCoords,
        type
      });

      // Start countdown timer
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            stopSearch();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Failed to start live search:', err);
      setIsSearching(false);
      alert('Failed to start live search');
    }
  };

  // Stop search
  const stopSearch = async () => {
    try {
      console.log('🛑 Stopping search');

      if (socket) {
        socket.emit('stop_search');
      }

      setIsSearching(false);
      setMatches([]);
      setSearchType(null);
      setTimeLeft(180);
      setMatchFound(null);
      setWaitingForApproval(false);
      setConnectionEstablished(false);
      setPartnerApproved(false);
      setChatRoom(null);
      setChatMessages([]);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (onStop) onStop();

    } catch (err) {
      console.error('Failed to stop search:', err);
    }
  };

  // Approve match
  const approveMatch = () => {
    if (socket && matchFound) {
      console.log('✅ Approving match:', matchFound.matchId);
      socket.emit('approve_match', { matchId: matchFound.matchId });
      // Don't set waitingForApproval here - let the server response handle it
    }
  };

  // Deny match
  const denyMatch = () => {
    if (socket && matchFound) {
      console.log('❌ Denying match:', matchFound.matchId);
      socket.emit('deny_match', { matchId: matchFound.matchId });
      setMatchFound(null);
      setWaitingForApproval(false);
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (socket && chatRoom && newMessage.trim()) {
      console.log('💬 Sending message:', newMessage);
      socket.emit('send_chat_message', {
        chatRoomId: chatRoom,
        message: newMessage.trim()
      });
      setNewMessage('');
    }
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!pickup || !drop || !pickupCoords || !dropCoords) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg text-center">
        <p className="text-gray-600">Enter pickup and drop locations to start live search</p>
        {socketConnected && (
          <p className="text-xs text-green-600 mt-2">✅ Real-time connection ready</p>
        )}
        {!socketConnected && (
          <p className="text-xs text-red-600 mt-2">❌ Connection issue - check backend</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border-2 border-blue-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">🔍 Live Search</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-xs text-gray-600">
            {socketConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Chat Interface */}
      {connectionEstablished && chatRoom && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-semibold text-green-800 mb-3">💬 Chat with your ride partner</h4>
          
          <div className="bg-white rounded border h-40 overflow-y-auto p-3 mb-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm">
                Start chatting to coordinate your ride!
              </div>
            ) : (
              <>
                {chatMessages.map((msg, index) => {
                  if (msg.type === "system") {
                    return (
                      <div key={index} className="text-center text-gray-500 text-xs my-2">
                        {msg.message}
                      </div>
                    );
                  }

                  const isMine = msg.senderId === currentUserId;

                  return (
                    <div
                      key={index}
                      className={`flex ${isMine ? "justify-end" : "justify-start"} mb-2`}
                    >
                      <div
                        className={`max-w-[70%] px-4 py-2 rounded-lg text-sm ${
                          isMine
                            ? "bg-blue-600 text-white rounded-br-none"
                            : "bg-gray-200 text-gray-800 rounded-bl-none"
                        }`}
                      >
                        {!isMine && (
                          <div className="text-xs font-semibold mb-1 text-gray-600">
                            {msg.senderName}
                          </div>
                        )}
                        <div>{msg.message}</div>
                        <div className="text-[10px] mt-1 opacity-70 text-right">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded text-sm"
            >
              Send
            </button>
          </div>

          {searchType === 'poolCar' && (
            <button
              onClick={() => {
                setChatMessages(prev => [...prev, {
                  type: 'system',
                  message: '🚗 Driver has started the ride!',
                  timestamp: new Date()
                }]);
                if (socket && chatRoom) {
                  socket.emit('send_chat_message', {
                    chatRoomId: chatRoom,
                    message: '🚗 Driver has started the ride!'
                  });
                }
              }}
              className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-semibold text-sm transition"
            >
              🚗 Start Ride
            </button>
          )}
        </div>
      )}

      {/* Match Found - Approval Interface */}
      {matchFound && !connectionEstablished && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-800 mb-3">⚡ Instant Match Found!</h4>
          
          <div className="bg-white rounded border p-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-semibold text-gray-800">{matchFound.partner.name}</h5>
                <p className="text-sm text-gray-600">
                  <strong>Route:</strong> {matchFound.partner.pickup} → {matchFound.partner.drop}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Type:</strong> {matchFound.partner.type === 'poolCar' ? '🚗 Offering Ride' : '🔍 Looking for Ride'}
                </p>
                <p className="text-sm text-blue-600">
                  <strong>Distance:</strong> {Math.round(matchFound.distance)}m away
                </p>
              </div>
            </div>
          </div>

          {waitingForApproval ? (
            <div className="text-center">
              <div className="animate-pulse mb-3">
                <p className="text-yellow-700">⏳ Waiting for partner approval...</p>
              </div>
              <div className="text-xs text-gray-600">
                You have approved. Waiting for your partner to approve.
              </div>
            </div>
          ) : (
            <div className="text-center">
              {partnerApproved && (
                <div className="mb-3 p-2 bg-green-100 border border-green-300 rounded">
                  <p className="text-green-700 text-sm">✅ Your partner approved! Click to connect.</p>
                </div>
              )}
              <p className="text-yellow-700 mb-3">Do you want to connect with this person?</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={approveMatch}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  ✅ Yes, Connect!
                </button>
                <button
                  onClick={denyMatch}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  ❌ No, Thanks
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Partner ended connection banner */}
      {partnerEndedMessage && (
        <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
            <span>🔚</span>
            <span>{partnerEndedMessage}</span>
          </div>
          <button
            onClick={() => setPartnerEndedMessage(null)}
            className="text-red-400 hover:text-red-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {!isSearching && !connectionEstablished ? (
        <div className="space-y-4">
          <p className="text-gray-600">
            Start a live search to find people actively looking for rides right now!
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={() => startSearch('findCar')}
              disabled={!socketConnected}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold transition"
            >
              🔍 Find a Car
            </button>
            <button
              onClick={() => startSearch('poolCar')}
              disabled={!socketConnected}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg font-semibold transition"
            >
              🚗 Pool a Ride
            </button>
          </div>
          
          {!socketConnected && (
            <p className="text-xs text-red-600 text-center">
              Please wait for connection to be established
            </p>
          )}
        </div>
      ) : isSearching && !matchFound && !connectionEstablished ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="animate-pulse w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="font-semibold text-green-700">
                {searchType === 'findCar' ? '🔍 Finding Cars' : '🚗 Pooling Ride'}
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">
                ⏱️ {formatTime(timeLeft)}
              </span>
              <button
                onClick={stopSearch}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition"
              >
                Stop
              </button>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm text-blue-700">
              <strong>Your Route:</strong> {pickup} → {drop}
            </p>
            <p className="text-sm text-blue-600 mt-1">
              Looking for {searchType === 'findCar' ? 'drivers offering rides' : 'passengers needing rides'}
            </p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <p className="text-yellow-700">
              🔍 Searching for live matches...
            </p>
            <p className="text-sm text-yellow-600 mt-1">
              We'll show people who are actively searching right now
            </p>
          </div>
        </div>
      ) : null}

      {connectionEstablished && (
        <div className="text-center">
          <button
            onClick={stopSearch}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium"
          >
            End Connection
          </button>
        </div>
      )}
    </div>
  );
}

export default LiveSearch;