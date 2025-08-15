import * as vscode from "vscode";
import { Position } from "../models/Types";

/**
 * Utility functions for working with positions and documents
 */
export class PositionUtils {
  /**
   * Convert VSCode Position to our Position interface
   * @param vscodePosition VSCode position object
   * @returns Our position interface
   */
  static fromVSCodePosition(vscodePosition: vscode.Position): Position {
    return {
      line: vscodePosition.line,
      character: vscodePosition.character,
    };
  }

  /**
   * Convert our Position interface to VSCode Position
   * @param position Our position interface
   * @returns VSCode position object
   */
  static toVSCodePosition(position: Position): vscode.Position {
    return new vscode.Position(position.line, position.character);
  }

  /**
   * Calculate distance between two positions
   * @param from Starting position
   * @param to Target position
   * @returns Distance object with line and character differences
   */
  static calculateDistance(
    from: Position,
    to: Position
  ): {
    lines: number;
    characters: number;
    totalDistance: number;
  } {
    const lines = to.line - from.line;
    const characters = to.character - from.character;
    const totalDistance = Math.abs(lines) + Math.abs(characters);

    return { lines, characters, totalDistance };
  }

  /**
   * Check if two positions are equal
   * @param pos1 First position
   * @param pos2 Second position
   * @returns True if positions are equal
   */
  static areEqual(pos1: Position, pos2: Position): boolean {
    return pos1.line === pos2.line && pos1.character === pos2.character;
  }

  /**
   * Check if a position is before another position
   * @param pos1 First position
   * @param pos2 Second position
   * @returns True if pos1 is before pos2
   */
  static isBefore(pos1: Position, pos2: Position): boolean {
    if (pos1.line < pos2.line) return true;
    if (pos1.line > pos2.line) return false;
    return pos1.character < pos2.character;
  }

  /**
   * Check if a position is after another position
   * @param pos1 First position
   * @param pos2 Second position
   * @returns True if pos1 is after pos2
   */
  static isAfter(pos1: Position, pos2: Position): boolean {
    return (
      !PositionUtils.isBefore(pos1, pos2) && !PositionUtils.areEqual(pos1, pos2)
    );
  }

  /**
   * Get the minimum position (earliest in document)
   * @param positions Array of positions
   * @returns The earliest position
   */
  static min(...positions: Position[]): Position {
    if (positions.length === 0) {
      throw new Error("At least one position is required");
    }

    return positions.reduce((min, current) =>
      PositionUtils.isBefore(current, min) ? current : min
    );
  }

  /**
   * Get the maximum position (latest in document)
   * @param positions Array of positions
   * @returns The latest position
   */
  static max(...positions: Position[]): Position {
    if (positions.length === 0) {
      throw new Error("At least one position is required");
    }

    return positions.reduce((max, current) =>
      PositionUtils.isAfter(current, max) ? current : max
    );
  }

  /**
   * Create a range from two positions
   * @param start Start position
   * @param end End position
   * @returns VSCode Range object
   */
  static createRange(start: Position, end: Position): vscode.Range {
    return new vscode.Range(
      PositionUtils.toVSCodePosition(start),
      PositionUtils.toVSCodePosition(end)
    );
  }

  /**
   * Check if a position is within a range
   * @param position Position to check
   * @param start Range start
   * @param end Range end
   * @returns True if position is within range
   */
  static isInRange(
    position: Position,
    start: Position,
    end: Position
  ): boolean {
    return (
      !PositionUtils.isBefore(position, start) &&
      !PositionUtils.isAfter(position, end)
    );
  }

  /**
   * Get surrounding lines around a position
   * @param document VSCode document
   * @param position Center position
   * @param contextLines Number of lines to include above and below
   * @returns Array of lines with line numbers
   */
  static getSurroundingLines(
    document: vscode.TextDocument,
    position: Position,
    contextLines: number = 3
  ): string[] {
    const startLine = Math.max(0, position.line - contextLines);
    const endLine = Math.min(
      document.lineCount - 1,
      position.line + contextLines
    );

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineText = document.lineAt(i).text;
      const marker = i === position.line ? " → " : "   ";
      lines.push(`${(i + 1).toString().padStart(3)}:${marker}${lineText}`);
    }

    return lines;
  }

  /**
   * Get code context around two positions
   * @param document VSCode document
   * @param currentPosition Current cursor position
   * @param targetPosition Target position
   * @param maxLines Maximum number of context lines
   * @returns Array of contextual lines
   */
  static getCodeContext(
    document: vscode.TextDocument,
    currentPosition: Position,
    targetPosition: Position,
    maxLines: number = 5
  ): string[] {
    const minPos = PositionUtils.min(currentPosition, targetPosition);
    const maxPos = PositionUtils.max(currentPosition, targetPosition);

    // Expand context around both positions
    const startLine = Math.max(0, minPos.line - maxLines);
    const endLine = Math.min(document.lineCount - 1, maxPos.line + maxLines);

    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineText = document.lineAt(i).text;
      let marker = "   ";

      if (i === currentPosition.line) {
        marker = " C "; // Current position
      } else if (i === targetPosition.line) {
        marker = " T "; // Target position
      }

      lines.push(`${(i + 1).toString().padStart(3)}:${marker}${lineText}`);
    }

    return lines;
  }

  /**
   * Extract filename from document URI
   * @param uri Document URI
   * @returns Filename without path
   */
  static getFileName(uri: vscode.Uri): string {
    const path = uri.fsPath;
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || "untitled";
  }

  /**
   * Get file extension from document URI
   * @param uri Document URI
   * @returns File extension (without dot) or empty string
   */
  static getFileExtension(uri: vscode.Uri): string {
    const fileName = PositionUtils.getFileName(uri);
    const lastDotIndex = fileName.lastIndexOf(".");
    return lastDotIndex !== -1 ? fileName.substring(lastDotIndex + 1) : "";
  }

  /**
   * Check if position is at beginning of line
   * @param position Position to check
   * @returns True if at beginning of line
   */
  static isAtLineStart(position: Position): boolean {
    return position.character === 0;
  }

  /**
   * Check if position is at end of line
   * @param document VSCode document
   * @param position Position to check
   * @returns True if at end of line
   */
  static isAtLineEnd(
    document: vscode.TextDocument,
    position: Position
  ): boolean {
    if (position.line >= document.lineCount) return true;

    const line = document.lineAt(position.line);
    return position.character >= line.text.length;
  }

  /**
   * Get indentation level at position
   * @param document VSCode document
   * @param position Position to check
   * @returns Number of leading whitespace characters
   */
  static getIndentationLevel(
    document: vscode.TextDocument,
    position: Position
  ): number {
    if (position.line >= document.lineCount) return 0;

    const line = document.lineAt(position.line);
    const match = line.text.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  /**
   * Find the nearest word boundary before a position
   * @param document VSCode document
   * @param position Starting position
   * @returns Position of word start or original position if none found
   */
  static findWordStart(
    document: vscode.TextDocument,
    position: Position
  ): Position {
    if (position.line >= document.lineCount) return position;

    const line = document.lineAt(position.line);
    const text = line.text;
    let char = Math.min(position.character, text.length - 1);

    // Move back to find word start
    while (char > 0 && /\w/.test(text[char - 1])) {
      char--;
    }

    return { line: position.line, character: char };
  }

  /**
   * Find the nearest word boundary after a position
   * @param document VSCode document
   * @param position Starting position
   * @returns Position of word end or original position if none found
   */
  static findWordEnd(
    document: vscode.TextDocument,
    position: Position
  ): Position {
    if (position.line >= document.lineCount) return position;

    const line = document.lineAt(position.line);
    const text = line.text;
    let char = position.character;

    // Move forward to find word end
    while (char < text.length && /\w/.test(text[char])) {
      char++;
    }

    return { line: position.line, character: char };
  }

  /**
   * Create a unique position identifier for caching
   * @param position Position object
   * @param documentUri Document URI
   * @returns Unique string identifier
   */
  static createPositionKey(position: Position, documentUri: string): string {
    const fileName = PositionUtils.getFileName(vscode.Uri.parse(documentUri));
    return `${fileName}:${position.line}:${position.character}`;
  }

  /**
   * Format position for display
   * @param position Position to format
   * @returns Human-readable position string
   */
  static formatPosition(position: Position): string {
    return `Line ${position.line + 1}, Column ${position.character + 1}`;
  }

  /**
   * Calculate vim motion complexity score
   * Used for determining if a motion is beginner/intermediate/advanced
   * @param from Starting position
   * @param to Target position
   * @returns Complexity score (0-10, higher is more complex)
   */
  static calculateMotionComplexity(from: Position, to: Position): number {
    const distance = PositionUtils.calculateDistance(from, to);
    let complexity = 0;

    // Distance factors
    complexity += Math.min(Math.abs(distance.lines) / 5, 3); // Line distance
    complexity += Math.min(Math.abs(distance.characters) / 10, 2); // Character distance

    // Same line horizontal movement is simpler
    if (distance.lines === 0 && Math.abs(distance.characters) < 10) {
      complexity *= 0.5;
    }

    // Large vertical movements suggest search or jump motions
    if (Math.abs(distance.lines) > 10) {
      complexity += 2;
    }

    return Math.min(complexity, 10);
  }
}
