import { safeYoutubeId } from '../utils/youtubeId';

describe('safeYoutubeId', () => {
  it('accepts valid ids', () => {
    expect(safeYoutubeId('ysz5S6PUM-U')).toBe('ysz5S6PUM-U');
    expect(safeYoutubeId('AP9fL9B_-F8')).toBe('AP9fL9B_-F8');
  });

  it('rejects injection attempts', () => {
    expect(safeYoutubeId('evil?id=1')).toBeNull();
    expect(safeYoutubeId('<script>')).toBeNull();
    expect(safeYoutubeId('')).toBeNull();
    expect(safeYoutubeId(null)).toBeNull();
  });
});
