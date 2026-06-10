import { BLOCKS, HOTBAR, makeIcon } from './blocks.js'

const STRINGS = {
  en: {
    sub: 'the eternal sunset',
    start: 'Click to take flight',
    keys: '<b>WASD</b> move &nbsp;·&nbsp; <b>Mouse</b> look &nbsp;·&nbsp; <b>Space</b> jump / swim &nbsp;·&nbsp; <b>Space ×2</b> take off &amp; glide<br/>' +
      '<b>Left click</b> break &nbsp;·&nbsp; <b>Right click</b> place &nbsp;·&nbsp; <b>1–8 / wheel</b> select block &nbsp;·&nbsp; <b>Shift</b> sprint',
    gliding: 'Gliding',
    walking: 'Walking',
    hintGlide: 'Pitch down to dive · pitch up to soar',
    hintTakeoff: 'Double-tap Space to take off again',
    names: {},
  },
  zh: {
    sub: '永恆的日落',
    start: '點擊起飛',
    keys: '<b>WASD</b> 移動 &nbsp;·&nbsp; <b>滑鼠</b> 視角 &nbsp;·&nbsp; <b>空白鍵</b> 跳躍／游泳 &nbsp;·&nbsp; <b>空白鍵 ×2</b> 起飛滑翔<br/>' +
      '<b>左鍵</b> 挖掘 &nbsp;·&nbsp; <b>右鍵</b> 放置 &nbsp;·&nbsp; <b>1–8／滾輪</b> 選擇方塊 &nbsp;·&nbsp; <b>Shift</b> 衝刺',
    gliding: '滑翔中',
    walking: '步行',
    hintGlide: '俯衝加速 · 拉升爬高',
    hintTakeoff: '連按兩下空白鍵，隨時再次起飛',
    names: {
      Grass: '草地', Dirt: '泥土', Stone: '石頭', Sand: '沙子',
      Log: '原木', Leaves: '樹葉', Planks: '木板', Snow: '雪',
    },
  },
}

export class UI {
  constructor(atlasCanvas) {
    const pref = new URLSearchParams(location.search).get('lang') || navigator.language || 'en'
    this.t = pref.toLowerCase().includes('zh') ? STRINGS.zh : STRINGS.en
    document.getElementById('sub').textContent = this.t.sub
    document.getElementById('start').textContent = this.t.start
    document.getElementById('keys').innerHTML = this.t.keys
    this.overlay = document.getElementById('overlay')
    this.hud = document.getElementById('hud')
    this.hotbarEl = document.getElementById('hotbar')
    this.modeEl = document.getElementById('mode')
    this.hintEl = document.getElementById('hint')
    this.waterTint = document.getElementById('water-tint')
    this.selected = 0
    this.slots = []

    HOTBAR.forEach((id, i) => {
      const slot = document.createElement('div')
      slot.className = 'slot' + (i === 0 ? ' selected' : '')
      const num = document.createElement('div')
      num.className = 'num'
      num.textContent = String(i + 1)
      const name = document.createElement('div')
      name.className = 'name'
      name.textContent = this.t.names[BLOCKS[id].name] || BLOCKS[id].name
      slot.appendChild(num)
      slot.appendChild(makeIcon(id, atlasCanvas))
      slot.appendChild(name)
      this.hotbarEl.appendChild(slot)
      this.slots.push(slot)
    })
    this._modeTimer = null
    this._hintTimer = null
  }

  select(i) {
    if (i < 0) i = HOTBAR.length - 1
    if (i >= HOTBAR.length) i = 0
    this.slots[this.selected].classList.remove('selected')
    this.selected = i
    this.slots[i].classList.add('selected')
    return HOTBAR[i]
  }

  selectedBlock() { return HOTBAR[this.selected] }

  setLocked(locked) {
    this.overlay.classList.toggle('hidden', locked)
    this.hud.classList.toggle('visible', locked)
  }

  showMode(text) {
    this.modeEl.textContent = text
    this.modeEl.classList.add('show')
    clearTimeout(this._modeTimer)
    this._modeTimer = setTimeout(() => this.modeEl.classList.remove('show'), 2200)
  }

  showHint(text, ms = 5200) {
    this.hintEl.textContent = text
    this.hintEl.classList.remove('fade')
    clearTimeout(this._hintTimer)
    this._hintTimer = setTimeout(() => this.hintEl.classList.add('fade'), ms)
  }

  setUnderwater(under) {
    this.waterTint.style.opacity = under ? '1' : '0'
  }
}
