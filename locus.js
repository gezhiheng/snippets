let sensorForward = true

// 业务参数和全局对象
const settings = {
  DEFAULT_CROSSHAIR_SIZE: 800,
  MAX_QUEUE_SIZE: 150,
  EASING_FACTOR: { size: 0.1, cameraSpeed: 0.03, position: 0.05 },
}

const canvas = {
  id: '',
  width: 0,
  height: 0,
  instance: undefined,
  ctx: undefined,
}

const crosshair = {
  img: new Image(),
  currentSize: 800,
  targetSize: 800,
  currentPosition: { x: 0, y: 0 },
  targetPosition: { x: 0, y: 0 },
}

const centerPoint = { x: 0, y: 0 }
const lastCoordinate = { x: 0, y: 0 }

const yawVal = { prev: 0, cur: 0 }
const pitchVal = { prev: 0, cur: 0 }

const camera = { x: 0, y: 0, zoom: 1 }

const liveCoordinates = []

const state = { tap: false, firstLoad: true }

const option = {
  yawRange: { min: 0, max: canvas.width },
  pitchRange: { min: 0, max: canvas.height },
}

function init(opt, canvasID = 'locus-canvas', crosshairImage = '/assets/icons/crosshair.svg', config = {}) {
  setOption(opt)
  sensorForward = config.sensorForward ?? true // 设置 sensorForward
  canvas.id = canvasID
  const width = window.innerWidth
  const height = window.innerHeight * 0.65

  canvas.width = width
  canvas.height = height

  centerPoint.x = width / 2
  centerPoint.y = height / 2

  crosshair.img.src = crosshairImage

  crosshair.currentPosition.x = centerPoint.x
  crosshair.currentPosition.y = centerPoint.y
  crosshair.targetPosition.x = centerPoint.x
  crosshair.targetPosition.y = centerPoint.y

  return { width, height }
}

function setOption(val) {
  option.yawRange.min = val?.yawRange?.min ?? 0
  option.yawRange.max = val?.yawRange?.max ?? canvas.width
  option.pitchRange.min = val?.pitchRange?.min ?? 0
  option.pitchRange.max = val?.pitchRange?.max ?? canvas.height
}

function drawCanvas() {
  const { DEFAULT_CROSSHAIR_SIZE, EASING_FACTOR } = settings

  if (!canvas.instance || !canvas.ctx) {
    canvas.instance = document.getElementById(canvas.id)
    canvas.ctx = canvas.instance.getContext('2d')
  }

  const width = canvas.width
  const height = canvas.height
  const halfWidth = width / 2
  const halfHeight = height / 2
  const ctx = canvas.ctx
  const offsetX = camera.x
  const offsetY = camera.y

  ctx.clearRect(0, 0, width, height)

  if (liveCoordinates.length > 1) {
    for (let i = 0, len = liveCoordinates.length; i < len; i++) {
      const { x, y } = liveCoordinates[i]
      drawDot(ctx, x - offsetX, y - offsetY)
    }
  }

  ctx.globalAlpha = 0.03
  const crosshairSize = DEFAULT_CROSSHAIR_SIZE
  ctx.drawImage(crosshair.img, centerPoint.x - crosshairSize / 2, centerPoint.y - crosshairSize / 2, crosshairSize, crosshairSize)

  ctx.globalAlpha = 0.08
  if (liveCoordinates.length > 0) {
    const target = liveCoordinates[liveCoordinates.length - 1]
    const targetX = target.x - offsetX
    const targetY = target.y - offsetY

    crosshair.targetPosition.x = Math.max(0, Math.min(targetX, width))
    crosshair.targetPosition.y = Math.max(0, Math.min(targetY, height))

    const dx = targetX - halfWidth
    const dy = targetY - halfHeight
    const distance = dx * dx + dy * dy
    const maxDistance = halfWidth * halfWidth + halfHeight * halfHeight

    crosshair.targetSize = DEFAULT_CROSSHAIR_SIZE - (distance / maxDistance) * DEFAULT_CROSSHAIR_SIZE
  } else {
    crosshair.targetPosition.x = centerPoint.x - offsetX
    crosshair.targetPosition.y = centerPoint.y - offsetY
    crosshair.targetSize = DEFAULT_CROSSHAIR_SIZE
  }

  crosshair.currentSize += (crosshair.targetSize - crosshair.currentSize) * EASING_FACTOR.size
  crosshair.currentPosition.x += (crosshair.targetPosition.x - crosshair.currentPosition.x) * EASING_FACTOR.position
  crosshair.currentPosition.y += (crosshair.targetPosition.y - crosshair.currentPosition.y) * EASING_FACTOR.position

  const size = crosshair.currentSize
  ctx.drawImage(crosshair.img, crosshair.currentPosition.x - size / 2, crosshair.currentPosition.y - size / 2, size, size)
}

function drawDot(ctx, x, y, radius = 5, color = '#C1272E', alpha = 0.5) {
  ctx.beginPath()
  ctx.globalAlpha = alpha
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

function updateLiveCoordinates(data) {
  const { MAX_QUEUE_SIZE } = settings
  const { correctedX, correctedY } = adjustValue(data.yaw, data.pitch)

  const steps = 3
  const stepX = (correctedX - lastCoordinate.x) / steps
  const stepY = (correctedY - lastCoordinate.y) / steps
  for (let i = 1; i <= steps; i++) {
    const interpolatedX = lastCoordinate.x + stepX * i
    const interpolatedY = lastCoordinate.y + stepY * i
    liveCoordinates.push({ x: interpolatedX, y: interpolatedY })
  }

  if (liveCoordinates.length > MAX_QUEUE_SIZE) {
    liveCoordinates.splice(0, liveCoordinates.length - MAX_QUEUE_SIZE)
  }

  updateCamera({ x: correctedX, y: correctedY })
  lastCoordinate.x = correctedX
  lastCoordinate.y = correctedY
}

function adjustValue(yaw, pitch) {
  const width = canvas.width
  const height = canvas.height
  const SCALE = 5

  const yawMin = option.yawRange.min
  const yawMax = option.yawRange.max
  const pitchMin = option.pitchRange.min
  const pitchMax = option.pitchRange.max

  const yawValue = Math.round(yaw * 10) / 10
  const pitchValue = Math.round(pitch * 10) / 10

  if (state.firstLoad) {
    state.firstLoad = false
    yawVal.prev = yawValue
    yawVal.cur = yawValue
    pitchVal.prev = pitchValue
    pitchVal.cur = pitchValue
  }

  const { diff: diffYaw } = isPositiveCycle(yawVal.prev, yawValue, [yawMin, yawMax])
  const { diff: diffPitch } = isPositiveCycle(pitchVal.prev, pitchValue, [pitchMin, pitchMax])

  const MAX_VAL = Number.MAX_SAFE_INTEGER
  const MIN_VAL = Number.MIN_SAFE_INTEGER

  yawVal.prev = yawValue
  yawVal.cur -= diffYaw
  if (yawVal.cur > MAX_VAL || yawVal.cur < MIN_VAL) {
    yawVal.cur = 0
  }

  pitchVal.prev = pitchValue
  if (sensorForward) {
    pitchVal.cur -= diffPitch
  } else {
    pitchVal.cur += diffPitch
  }
  if (pitchVal.cur > MAX_VAL || pitchVal.cur < MIN_VAL) {
    pitchVal.cur = 0
  }

  const correctedX = Math.round(((yawVal.cur - yawMin) / (yawMax - yawMin)) * width * SCALE)
  const correctedY = Math.round(((pitchVal.cur - pitchMin) / (pitchMax - pitchMin)) * height * SCALE)
  return { correctedX, correctedY }
}

function isPositiveCycle(prevNumber, currentNumber, range) {
  const rangeSize = range[1] - range[0]
  const threshold = rangeSize / 2
  let diff = currentNumber - prevNumber
  if (diff > threshold) {
    diff -= rangeSize
  } else if (diff < -threshold) {
    diff += rangeSize
  }
  diff = Math.round(diff * 10) / 10
  return { isPositive: diff > 0, diff }
}

function updateCamera(target) {
  const { EASING_FACTOR } = settings
  const targetX = target.x - centerPoint.x
  const targetY = target.y - centerPoint.y
  camera.x += (targetX - camera.x) * EASING_FACTOR.cameraSpeed
  camera.y += (targetY - camera.y) * EASING_FACTOR.cameraSpeed
}

export {
  drawCanvas,
  init,
  updateLiveCoordinates,
}
