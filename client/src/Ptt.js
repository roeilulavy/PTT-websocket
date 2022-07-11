import { useEffect, useState } from 'react';
import { MediaPresenter, AudioStreamer, Media } from 'sfmediastream';
import io from 'socket.io-client';
import './Ptt.css';

import Hold from './sounds/Hold.mp3';
import Transmit from './sounds/transmit.mp3';

// const socket = io('http://localhost:9000');
const socket = io('http://192.168.50.219:9000');

const gainNode = Media.audioContext.createGain();
const audioStreamer = new AudioStreamer(Audio, 1000);
const presenterMedia = new MediaPresenter({
  audio:{
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  }
}, 250);

export default function Ptt() {

  const channelInput = document.getElementById("channel-input");
  let audio = null;

  const [state, setState] = useState('');
  const [id, setId] = useState('');
  const [channel, setChannel] = useState(localStorage.getItem('channel'));
  const [message, setMessage] = useState('');
  const [isWarning, setIsWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [connectionError, setConnectionError] = useState(false);
  const [connectionState, setConnectionState] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [volume, setVolume] = useState(0.5);

  audioStreamer.connect(gainNode);
  gainNode.connect(Media.audioContext.destination);

  useEffect(() => {
    if (localStorage.getItem('channel') === null) {
      localStorage.setItem('channel', 3000);
    }

    setChannel(localStorage.getItem('channel'));
  }, []);

  useEffect(() => {
    gainNode.gain.value = volume;
  }, [volume]);

  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log("enumerateDevices() not supported.");
      setIsWarning(true);
      setWarningMessage('enumerateDevices() not supported.');
      setIsSupported(false);
      return;
    } else {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const inputList = [];

          devices.forEach(device => {
            if (device.kind === 'audioinput') {
              inputList.push(device);
            };
          });

          if (inputList.length === 0) {
            setIsWarning(true);
            setWarningMessage('Recorder device not found!');
            setIsSupported(false);
          } else {
            setIsWarning(false);
            setWarningMessage('');
            setIsSupported(true);
          }
        });
    };
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      socket.emit('join-room', channel);
      setState('Idle');
      setId(socket.id);
      console.log(`You are connected with socketID: ${socket.id} in Channel: ${channel}`);
    });
  
    socket.on('connect_error', () => {
      setState('Connection-lost');
      setConnectionError(true);
      setConnectionState('Connection lost!');
      console.log('connect_error');
    });

    socket.io.on('reconnect_attempt', () => {
      setState('Reconnecting');
      setConnectionState('Reconnecting..');
      console.log('reconnect_attempt');
    });

    socket.io.on('reconnect', () => {
      setState('Idle');
      setConnectionError(false);
      setConnectionState('Connected');
      console.log('reconnected!');
    });
  
    socket.on('receive-sos', (id) => {
      setState('Incoming-SOS');
      setMessage(`S.O.S from: ${id}`);
      audioStreamer.playStream();
    });
    
    socket.on('receive-sos-end', () => {
      setState('Idle');
      setMessage('');
      audioStreamer.stop();
    });
  
    socket.on('receive-voice-message', (id) => {
      setState('Incoming-Broadcast');
      setMessage(id);
      audioStreamer.playStream();
    });
    
    socket.on('receive-voice-message-end', () => {
      setState('Idle');
      setMessage('');
      audioStreamer.stop();
    });
  
    socket.on('bufferHeader', (data) => {
      audioStreamer.setBufferHeader(data);
    });
    
    socket.on('stream', (data) => {
      console.log("Buffer received: " + data[0].byteLength + "bytes");
      audioStreamer.realtimeBufferPlay(data);
    });
  }, [socket]);

  function handleChangeChannel() {
    if (channelInput.value === '' || state === 'Connection-lost' || state === 'Reconnecting') return;

    let prevChannel = channel;
    let newChannel = channelInput.value;

    localStorage.setItem('channel', newChannel);
    setChannel(newChannel);

    socket.emit('change-room', prevChannel, newChannel);
    
    channelInput.value = '';
    channelInput.blur();
  };

  function onSosClick() {
    if (state === 'Connection-lost' || state === 'Reconnecting') {
      audio = new Audio(Hold);
      audio.volume = volume;
      audio.play();
    } else {
      setState('SOS-Sent');
      setMessage('SOS Sent');

      socket.emit('sos-start', id, channel);
      startRcording();

      setTimeout(() => {
        socket.emit('sos-end', channel);
        stopRcording();

        setMessage('');
        setState('Idle');
      }, 10000);
    };
  };

  function onPttDown() {

    if (state === 'SOS-Sent') return;

    if (state === 'Connection-lost' || state === 'Reconnecting') {
      audio = new Audio(Hold);
      audio.volume = volume;
      audio.play();
    };

    if (state === 'Incoming-Broadcast' || state === 'Incoming-SOS') {
      audioStreamer.stop();

      audio = new Audio(Hold);
      audio.volume = volume;
      audio.play();

      setTimeout(() => {
        audioStreamer.playStream();
      }, 400)
    };

    if (state === 'Idle') {
      audio = new Audio(Transmit);
      audio.volume = volume;
      audio.play();

      setTimeout(() => {
        socket.emit('voice-message-start', id, channel);
        startRcording();
      }, 500);
    };
  };

  function onPttUp() {
    if (state === 'SOS-Sent') return;

    socket.emit('voice-message-end', id, channel);
    stopRcording();
  };

  function startRcording() {
    presenterMedia.onRecordingReady = (packet) => {
      console.log("Header size: " + packet.data.size + "bytes");
      socket.emit('bufferHeader', channel, packet);
    };
  
    presenterMedia.onBufferProcess = (packet) => {
      console.log("Buffer sent: " + packet[0].size + "bytes");
      socket.emit('stream', channel, packet);
    };
  
    presenterMedia.startRecording();
  };

  function stopRcording() {
    presenterMedia.stopRecording();
  };

  return (
    <div className="ptt">
      <div className='message-container'>
        <p className='message-id'>{id}</p>
        <p className='message-channel'>{channel}</p>
        <p className='message-talker'>{message}</p>
        { isWarning && <p className='message-warnings'>{warningMessage}</p> }
        { connectionError && <p className='message-warnings'>{connectionState}</p> }
      </div>
      <div className='channel-input-container'>
        <label className='channel-label' htmlFor='channel__input'>Channel</label>
        <input type='text' id='channel-input' className='channel__input' autoComplete='off' />
        <button type='submit' className='channel__input-button' onClick={handleChangeChannel}>Join</button>
      </div>
      <div className='buttons-container'>
        {isSupported && 
          <>
            <button id='sos-button' className='sos-button' type='button' onPointerDown={onSosClick}>S.O.S</button>
            <button id='ptt-button' className='ptt-button' type='button' onPointerDown={onPttDown} onPointerUp={onPttUp}>PTT</button>
          </>
        }
        <input type='range' id='volume' min='0' max='1' step='0.05' value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}
