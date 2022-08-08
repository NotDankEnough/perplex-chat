import { html } from 'uhtml'
// eslint-disable-next-line no-unused-vars
import { ChatClient, PrivmsgMessage, UsernoticeMessage, ClearmsgMessage, ClearchatMessage } from 'dank-twitch-irc'

import Random from './random'

// This is a "Proof of Concept".

const urlParams = new URLSearchParams(window.location.search)

const escapeRegExp = (text: string) => {
  return text.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&')
}

const escapeXML = (str: string) => {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;')
}

const channel = urlParams.get('channel') || 'harmfulopinions'

const ffzEmotes = []
const bttvEmotes = []
const stvEmotes = []

let loadedEmotes = false

function getEmotes (channelId: string) {
  // All of these should be allowed to fail.

  fetch(`https://api.frankerfacez.com/v1/room/${channel}`).then(res => res.json()).then(res => {
    if (!res.error) {
      ffzEmotes.push(...res.sets[res.room.set].emoticons)
    }
  })

  fetch('https://api.frankerfacez.com/v1/set/global').then(res => res.json()).then(res => {
    ffzEmotes.push(...res.sets[res.default_sets[0]].emoticons)
  })

  fetch('https://api.betterttv.net/3/cached/emotes/global').then(res => res.json()).then(res => {
    bttvEmotes.push(...res)
  })

  fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`).then(res => res.json()).then(res => {
    if (!res.message) {
      bttvEmotes.push(...res.sharedEmotes)
      bttvEmotes.push(...res.channelEmotes)
    }
  })

  fetch(`https://api.7tv.app/v2/users/${channelId}/emotes`).then(res => res.json()).then(res => {
    if (!res.error) {
      stvEmotes.push(...res)
    }
  })

  fetch(`https://api.7tv.app/v2/emotes/global`).then(res => res.json()).then(res => {
    stvEmotes.push(...res)
  })
}

const client = new ChatClient({
  connection: {
    type: 'websocket',
    secure: true
  }
})

client.on('372', msg => console.log(`Twitch IRC: ${msg.ircParameters.join(' ')}`))

client.on('ready', () => console.log('Successfully connected to Twitch IRC.'))

client.on('close', error => {
  if (error != null) {
    console.error('Client closed due to error', error)
  }
})

client.on('PRIVMSG', displayMessage)
client.on('USERNOTICE', displayMessage)

function displayMessage (msg: PrivmsgMessage | UsernoticeMessage) {
  try {
    const isUsernotice = msg instanceof UsernoticeMessage

    if (!loadedEmotes) {
      loadedEmotes = true
      getEmotes(msg.channelID)
    }

    if (document.visibilityState === 'hidden') {
      return
    }

    const parent = document.getElementById('perplexchat').querySelector('.marquee')

    const date = msg.serverTimestamp
    const seededRandom = new Random(String(date.getTime()))

    const { size, color, direction, y, duration } = seededRandom
    const sSize = size(isUsernotice)
    const dDuration = duration(isUsernotice)

    const style = `top:${y(sSize)}px;font-size:${sSize}rem;${isUsernotice ? 'z-index:100;' : ''}`
    const event = ev => { ev.currentTarget.outerHTML = '' }
    const msgText = msg instanceof UsernoticeMessage
      ? (msg.messageText ? `${msg.senderUsername}: ${msg.messageText}` : msg.systemMessage)
      : msg.messageText

    const node = html.node`
      <div data-message="${msg.messageID}" data-user="${msg.senderUsername}" class="${`${direction()} ${dDuration}`}" onanimationend="${event}" style="${style}">
        <p class="${isUsernotice ? 'rainbow' : color()}">${msgText}</p>
      </div>
    `

    if (msg.messageText != null) {
      // Replace emotes with placeholders
      const words = msg.messageText.split(' ')
      for (let index = 0; index < words.length; index++) {
        const word = words[index]
        const wordEscaped = escapeXML(word)

        let url: string
        const regex = new RegExp(escapeRegExp(wordEscaped))

        const matchesTwitch = msg.emotes.find(emote => emote.code === word)
        const matchesFFZ = ffzEmotes.find(emote => emote.name === word)
        const matchesBTTV = bttvEmotes.find(emote => emote.code === word)
        const matchesSTV = stvEmotes.find(emote => emote.name === word)

        if (matchesTwitch != null) {
          url = `//static-cdn.jtvnw.net/emoticons/v2/${matchesTwitch.id}/default/dark/3.0`
        } else if (matchesFFZ != null) {
          const emoteUrls = Object.keys(matchesFFZ.urls).map(key => matchesFFZ.urls[key])
          url = emoteUrls[emoteUrls.length - 1]
        } else if (matchesBTTV != null) {
          url = `//cdn.betterttv.net/emote/${matchesBTTV.id}/3x`
        } else if (matchesSTV != null) {
          url = `//cdn.7tv.app/emote/${matchesSTV.id}/4x`
        }

        if (url) {
          node.innerHTML = node.innerHTML.replace(regex, `<img style="${`height:${sSize}rem;`}" src="${url}"/>`)
        }
      }

      // Filter bad words.
      if (msg.flags != null) {
        for (let index = 0; index < msg.flags.length; index++) {
          const word = msg.flags[index].word
          const censorStars = Array(word.length).fill('*').join('')
          node.innerHTML = node.innerHTML.replace(new RegExp(escapeRegExp(word)), censorStars)
        }
      }
    }

    parent.append(node)
  } catch (error) {
    console.error(error)
  }
}

client.on('CLEARMSG', deleteMessage)
client.on('CLEARCHAT', deleteMessage)

function deleteMessage (msg: ClearmsgMessage | ClearchatMessage) {
  if (msg instanceof ClearmsgMessage) {
    if (msg.targetMessageID) {
      const node = document.querySelector(`[data-message="${msg.targetMessageID}"]`)
      if (node !== null) node.outerHTML = ''
    }
  } else if (msg instanceof ClearchatMessage) {
    if (msg.targetUsername) {
      document.querySelectorAll(`[data-user="${msg.targetUsername}"`).forEach(el => {
        el.outerHTML = ''
      })
    } else if (msg.wasChatCleared()) {
      document.querySelector('.marquee').innerHTML = ''
    }
  }
}

client.connect()

client.join(channel)
