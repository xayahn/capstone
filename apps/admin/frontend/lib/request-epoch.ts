/** A delayed read must not restore private data after a newer read or denial. */
export class RequestEpoch {
  private generation = 0;
  begin(): number { return ++this.generation; }
  isCurrent(ticket: number): boolean { return ticket === this.generation; }
  invalidate(): void { this.generation++; }
}
