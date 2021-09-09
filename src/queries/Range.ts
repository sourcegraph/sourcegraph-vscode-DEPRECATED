/**
 * Identical to vscode.Position except it's a plain interface instead of a class.
 */
export interface Position {
    line: number
    character: number
}

/**
 * Identical to vscode.Range except it's a plain interface instead of a class.
 */
export interface Range {
    start: Position
    end: Position
}
