import { BLOCKS, HOTBAR, makeIcon } from './blocks.js'

export class UI {
  constructor(atlasCanvas) {
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
      name.textContent = BLOCKS[id].name
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
