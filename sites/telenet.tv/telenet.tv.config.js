const axios = require('axios')
const dayjs = require('dayjs')

const API_STATIC_ENDPOINT = 'https://static.spark.telenet.tv/eng/web/epg-service-lite/be'
const API_PROD_ENDPOINT = 'https://prod.spark.telenet.tv/eng/web/linear-service/v2'

module.exports = {
  site: 'telenet.tv',
  request: {
    cache: {
      ttl: 60 * 60 * 1000 // 1 hour
    }
  },
  url: function ({ date, channel }) {
    return `${API_STATIC_ENDPOINT}/${channel.lang}/events/segments/${date.format('YYYYMMDDHHmmss')}`
  },
  async parser({ content, channel, date }) {
    let programs = []
    let items = parseItems(content, channel)
    if (!items.length) return programs
    const promises = [
      axios.get(
        `${API_STATIC_ENDPOINT}/${channel.lang}/events/segments/${date
          .add(6, 'h')
          .format('YYYYMMDDHHmmss')}`,
        {
          responseType: 'arraybuffer'
        }
      ),
      axios.get(
        `${API_STATIC_ENDPOINT}/${channel.lang}/events/segments/${date
          .add(12, 'h')
          .format('YYYYMMDDHHmmss')}`,
        {
          responseType: 'arraybuffer'
        }
      ),
      axios.get(
        `${API_STATIC_ENDPOINT}/${channel.lang}/events/segments/${date
          .add(18, 'h')
          .format('YYYYMMDDHHmmss')}`,
        {
          responseType: 'arraybuffer'
        }
      )
    ]

    await Promise.allSettled(promises)
      .then(results => {
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const parsed = parseItems(r.value.data, channel)

            items = items.concat(parsed)
          }
        })
      })
      .catch(console.error)

    for (let item of items) {
      const detail = await loadProgramDetails(item, channel)
      programs.push({
        title: item.title,
        description: detail.longDescription,
        category: detail.genres,
        actors: detail.actors,
        season: detail.seasonNumber,
        episode: detail.episodeNumber,
        start: parseStart(item),
        stop: parseStop(item)
      })
    }

    return programs
  },
  async channels() {
    const data = await axios
      .get(`${API_PROD_ENDPOINT}/channels?cityId=65535&language=en&productClass=Orion-DASH`)
      .then(r => r.data)
      .catch(console.log)

    return data.channels.map(item => {
      return {
        lang: 'be',
        site_id: item.id,
        name: item.name
      }
    })
  }
}

async function loadProgramDetails(item, channel) {
  if (!item.id) return {}
  const url = `${API_PROD_ENDPOINT}/replayEvent/${item.id}?returnLinearContent=true&language=${channel.lang}`
  const data = await axios
    .get(url)
    .then(r => r.data)
    .catch(console.log)

  return data || {}
}

function parseStart(item) {
  return dayjs.unix(item.startTime)
}

function parseStop(item) {
  return dayjs.unix(item.endTime)
}

function parseItems(content, channel) {
  if (!content) return []
  const data = JSON.parse(content)
  if (!data || !Array.isArray(data.entries)) return []
  const channelData = data.entries.find(e => e.channelId === channel.site_id)
  if (!channelData) return []

  return Array.isArray(channelData.events) ? channelData.events : []
}
