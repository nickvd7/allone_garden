import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StructuresPanel, { STRUCTURE_DEFS } from '../components/StructuresPanel';

describe('StructuresPanel', () => {
  const noop = jest.fn();

  // ── Rendering ────────────────────────────────────────────────────────────────

  it('renders all 3 structure definitions', () => {
    render(<StructuresPanel onBuild={noop} onUseWell={noop} onUseCompost={noop} />);
    expect(screen.getByText('Water Well')).toBeInTheDocument();
    expect(screen.getByText('Compost Heap')).toBeInTheDocument();
    expect(screen.getByText('Greenhouse')).toBeInTheDocument();
  });

  it('exports STRUCTURE_DEFS with 3 entries', () => {
    expect(STRUCTURE_DEFS).toHaveLength(3);
    expect(STRUCTURE_DEFS.map((d) => d.id)).toEqual(['well', 'compost', 'greenhouse']);
  });

  // ── Build buttons ─────────────────────────────────────────────────────────────

  it('shows a build button for each unbuilt structure', () => {
    render(
      <StructuresPanel structures={{}} coins={200} onBuild={noop} onUseWell={noop} onUseCompost={noop} />
    );
    // Well costs 50, Compost 30, Greenhouse 80 — all affordable
    const buildBtns = screen.getAllByRole('button', { name: /🔨/ });
    expect(buildBtns).toHaveLength(3);
  });

  it('disables the build button when coins are insufficient', () => {
    render(
      <StructuresPanel structures={{}} coins={0} onBuild={noop} onUseWell={noop} onUseCompost={noop} />
    );
    screen.getAllByRole('button', { name: /🔨/ }).forEach((btn) =>
      expect(btn).toBeDisabled()
    );
  });

  it('enables only affordable build buttons based on coins', () => {
    // Compost costs 30, Well costs 50, Greenhouse costs 80
    render(
      <StructuresPanel structures={{}} coins={35} onBuild={noop} onUseWell={noop} onUseCompost={noop} />
    );
    const buildBtns = screen.getAllByRole('button', { name: /🔨/ });
    // Only the compost button (30 coins) should be enabled; well (50) and greenhouse (80) disabled
    const [wellBtn, compostBtn, greenhouseBtn] = buildBtns;
    expect(wellBtn).toBeDisabled();
    expect(compostBtn).not.toBeDisabled();
    expect(greenhouseBtn).toBeDisabled();
  });

  it('calls onBuild with the structure id when a build button is clicked', () => {
    const onBuild = jest.fn();
    render(
      <StructuresPanel structures={{}} coins={200} onBuild={onBuild} onUseWell={noop} onUseCompost={noop} />
    );
    const buildBtns = screen.getAllByRole('button', { name: /🔨/ });
    fireEvent.click(buildBtns[0]); // first = well
    expect(onBuild).toHaveBeenCalledWith('well');
  });

  // ── Built state ───────────────────────────────────────────────────────────────

  it('shows "✅ Built" tag instead of build button for built structures', () => {
    render(
      <StructuresPanel
        structures={{ well: { built: true, charges: 3 } }}
        coins={200}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByText('✅ Built')).toBeInTheDocument();
  });

  // ── Well ─────────────────────────────────────────────────────────────────────

  it('shows charge count and "Draw Water" button when well is built', () => {
    render(
      <StructuresPanel
        structures={{ well: { built: true, charges: 2 } }}
        coins={100}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByText(/💧 2\/3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Draw Water/i })).toBeInTheDocument();
  });

  it('"Draw Water" button is disabled when well charges are 0', () => {
    render(
      <StructuresPanel
        structures={{ well: { built: true, charges: 0 } }}
        coins={100}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByRole('button', { name: /Draw Water/i })).toBeDisabled();
  });

  it('calls onUseWell when "Draw Water" is clicked', () => {
    const onUseWell = jest.fn();
    render(
      <StructuresPanel
        structures={{ well: { built: true, charges: 2 } }}
        coins={100}
        onBuild={noop}
        onUseWell={onUseWell}
        onUseCompost={noop}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Draw Water/i }));
    expect(onUseWell).toHaveBeenCalledTimes(1);
  });

  // ── Compost ──────────────────────────────────────────────────────────────────

  it('shows "Fertilize All" button when compost is built with charges', () => {
    render(
      <StructuresPanel
        structures={{ compost: { built: true, charges: 1, harvestsUntilNext: 2 } }}
        coins={100}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByRole('button', { name: /Fertilize All/i })).not.toBeDisabled();
  });

  it('"Fertilize All" button is disabled when compost has 0 charges', () => {
    render(
      <StructuresPanel
        structures={{ compost: { built: true, charges: 0 } }}
        coins={100}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByRole('button', { name: /Fertilize All/i })).toBeDisabled();
  });

  it('calls onUseCompost when "Fertilize All" is clicked', () => {
    const onUseCompost = jest.fn();
    render(
      <StructuresPanel
        structures={{ compost: { built: true, charges: 2 } }}
        coins={100}
        onBuild={noop}
        onUseWell={onUseCompost}
        onUseCompost={onUseCompost}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Fertilize All/i }));
    expect(onUseCompost).toHaveBeenCalledTimes(1);
  });

  // ── Greenhouse ───────────────────────────────────────────────────────────────

  it('shows "Active" protection status when greenhouse is built', () => {
    render(
      <StructuresPanel
        structures={{ greenhouse: { built: true } }}
        coins={100}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByText(/Active — protecting against storms/i)).toBeInTheDocument();
  });
});
