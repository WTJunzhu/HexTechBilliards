/**
 * 2D Vector utility class for physics calculations
 * Referenced from Classic-8-Ball-Pool's Vector2 implementation
 */
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  static get zero(): Vector2 {
    return new Vector2(0, 0)
  }

  static fromAngle(angle: number, length: number = 1): Vector2 {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length)
  }

  static distance(a: Vector2, b: Vector2): number {
    return a.subtract(b).length
  }

  static distanceSq(a: Vector2, b: Vector2): number {
    return a.subtract(b).lengthSq
  }

  static dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y
  }

  static lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return new Vector2(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t
    )
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y)
  }

  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  get lengthSq(): number {
    return this.x * this.x + this.y * this.y
  }

  get angle(): number {
    return Math.atan2(this.y, this.x)
  }

  get normalized(): Vector2 {
    const len = this.length
    if (len === 0) return Vector2.zero
    return new Vector2(this.x / len, this.y / len)
  }

  get perpendicular(): Vector2 {
    return new Vector2(-this.y, this.x)
  }

  get negate(): Vector2 {
    return new Vector2(-this.x, -this.y)
  }

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y)
  }

  subtract(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y)
  }

  multiply(s: number): Vector2 {
    return new Vector2(this.x * s, this.y * s)
  }

  divide(s: number): Vector2 {
    if (s === 0) return Vector2.zero
    return new Vector2(this.x / s, this.y / s)
  }

  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y
  }

  cross(v: Vector2): number {
    return this.x * v.y - this.y * v.x
  }

  rotate(angle: number): Vector2 {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    )
  }

  reflect(normal: Vector2): Vector2 {
    const d = 2 * this.dot(normal)
    return this.subtract(normal.multiply(d))
  }

  distFrom(v: Vector2): number {
    return Vector2.distance(this, v)
  }

  set(x: number, y: number): void {
    this.x = x
    this.y = y
  }

  copyFrom(v: Vector2): void {
    this.x = v.x
    this.y = v.y
  }

  equals(v: Vector2, epsilon: number = 0.0001): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon
  }

  toString(): string {
    return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`
  }
}
