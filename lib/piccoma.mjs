import canvas from 'canvas'
import fs from 'fs'
import get from 'simple-get'
import getSeed from './get-seed.mjs'
import unscramble from './unscramble.mjs'
const { Image } = canvas
export default class PiccomaPage {
  constructor(page, options) {
    /** @type {import('puppeteer-core').Page} */
    this.page = page
    this.options = options
  }

  async login(mail, password) {
    this.page.goto('https://piccoma.com/web/acc/email/signin?next_url=/web/')
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    await this.page.type('[name=email]', mail, { delay: 50 })
    await this.page.type('[name=password]', password, { delay: 50 })
    await this.page.click('.PCM-submitButton input[type=submit]', { delay: 500 })
    await this.page.waitForNavigation()
  }

  async getBookmarks() {
    this.page.goto('https://piccoma.com/web/bookshelf/bookmark')
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    return this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('.PCM-product')).map(a => ({
        id: a.href.split('/').pop(),
        url: a.href,
        title: a.querySelector('.PCM-productCoverImage_title').textContent,
        webtoon: a.parentElement.classList.contains('PCM-stt_smartoon')
      }))
    })
  }

  async getEpisodes(url, useFree) {
    this.page.goto(url)
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    return this.page.evaluate((useFree) => {
      const episodes = document.querySelectorAll('.PCM-product_episodeList a')
      return Array.from(episodes)
        .filter(ep => {
          const freeEl = ep.querySelector('.PCM-epList_status_webwaitfree img')
          const pointEl = ep.querySelector('.PCM-epList_status_point .js_point')
          if (freeEl && useFree) {
            useFree = false
            return true
          }
          return freeEl == null && pointEl == null
        })
        .map(ep => {
          return {
            name: ep.querySelector('.PCM-epList_title h2').textContent,
            id: ep.dataset.episode_id,
          }
        })
    }, useFree)
  }

  async getVolumes(url) {
    this.page.goto(url)
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    return this.page.evaluate(() => {
      const volumes = document.querySelectorAll('.PCM-prdVol')
      return Array.from(volumes)
        .map(vol => [
          vol.querySelector('.PCM-prdVol_freeBtn'),
          vol.querySelector('.PCM-prdVol_readBtn'),
          vol.querySelector('.PCM-prdVol_title h2').textContent
        ])
        .filter(([freeButton, readButton]) => freeButton || readButton)
        .map(([freeButton, readButton, name]) => {
          return {
            name: String(name),
            id: freeButton ? freeButton.dataset.episode_id : readButton.dataset.episode_id,
          }
        })
    })
  }

  async saveVolume(url, dist, progress) {
    this.page.goto(url)
    await this.page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    const pdata = await this.page.evaluate(() => {
      return window._pdata_
    })
    if (pdata == null) {
      console.log('May not have been purchased. ' + dist)
      return
    }
    fs.mkdirSync(dist, { recursive: true })
    for (let i = 0; i < pdata.img.length - 1; i++) {
      const img = pdata.img[i]
      const url = 'https:' + img.path
      if (fs.existsSync(`${dist}/${i + 1}.${this.options.format}`)) {
        continue
      }
      const buffer = await this._saveUrlImage(pdata, url, this.options)
      await fs.promises.writeFile(`${dist}/${i + 1}.${this.options.format}`, buffer)
      progress(i + 1,　pdata.img.length - 1)
    }
  }

  async _saveUrlImage(pdata, url) {
    const image = await this._loadImage(url)
    const canvas = unscramble(pdata, image, 50, getSeed(url))
    if (this.options.format == 'jpg') {
      return canvas.toBuffer('image/jpeg', { quality: this.options.quality ?? 85 })
    } else {
      return canvas.toBuffer('image/png')
    }
  }

  async _loadImage(url, _image = null, retry = true) {
    const image = _image == null ? new Image() : _image
    try {
      const data = await this._fetchData({ url, timeout: 20000 })
      image.src = data
      return image
    } catch (error) {
      if (retry) {
        return this._loadImage(url, image, false)
      }
      throw error
    }
  }
  
  _fetchData(options) {
    return new Promise((resolve, reject) => {
      get.concat(options, (err, res, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })
  }
}