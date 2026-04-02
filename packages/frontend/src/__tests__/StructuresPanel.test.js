import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StructuresPanel, { STRUCTURE_DEFS } from '../components/StructuresPanel';

describe('StructuresPanel', () => {
  const noop = jest.fn();

  // ── Rendering ────────────────────────────────────────────────────────────────

  it('renders all structure definitions', () => {
    render(<StructuresPanel onBuild={noop} onUseWell={noop} onUseCompost={noop} />);
    expect(screen.getByText('Water Well')).toBeInTheDocument();
    expect(screen.getByText('Compost Heap')).toBeInTheDocument();
    expect(screen.getByText('Greenhouse')).toBeInTheDocument();
    expect(screen.getByText('Barn')).toBeInTheDocument();
    expect(screen.getByText('Chicken Coop')).toBeInTheDocument();
    expect(screen.getByText('Stable')).toBeInTheDocument();
    expect(screen.getByText('Silo')).toBeInTheDocument();
  });

  it('exports STRUCTURE_DEFS with 7 entries', () => {
    expect(STRUCTURE_DEFS).toHaveLength(7);
    expect(STRUCTURE_DEFS.map((d) => d.id)).toEqual([
      'well', 'compost', 'greenhouse', 'barn', 'chickenCoop', 'stable', 'silo',
    ]);
  });

  // ── Build buttons ─────────────────────────────────────────────────────────────

  it('shows a build button for each unbuilt structure', () => {
    render(
      <StructuresPanel structures={{}} coins={500} onBuild={noop} onUseWell={noop} onUseCompost={noop} />
    );
    // 7 structure defs — all show build buttons (coop/stable may be disabled until barn built)
    const buildBtns = screen.getAllByRole('button', { name: /🔨/ });
    expect(buildBtns).toHaveLength(7);
  });

  it('disables all build buttons when coins are 0', () => {
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

  // ── Barn ─────────────────────────────────────────────────────────────────────

  it('shows barn "animals unlocked" status when barn is built', () => {
    render(
      <StructuresPanel
        structures={{ barn: { built: true } }}
        coins={200}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByText(/Animals unlocked/i)).toBeInTheDocument();
  });

  it('disables Chicken Coop and Stable build buttons when barn is not built', () => {
    render(
      <StructuresPanel structures={{}} coins={500} onBuild={noop} onUseWell={noop} onUseCompost={noop} />
    );
    // Both coop and stable require barn — both should be disabled with this title
    const prereqBtns = screen.getAllByTitle(/requires barn first/i);
    expect(prereqBtns).toHaveLength(2);
    prereqBtns.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('enables Chicken Coop build button once barn is built and coins are sufficient', () => {
    render(
      <StructuresPanel
        structures={{ barn: { built: true } }}
        coins={200}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    // With barn built + 200 coins, Coop (60) should be enabled
    const coopBtn = screen.getByTitle(/Build for 🪙60/i);
    expect(coopBtn).not.toBeDisabled();
  });

  // ── Chicken Coop ─────────────────────────────────────────────────────────────

  it('shows "Egg ready!" and enabled Collect Eggs button when eggReady', () => {
    render(
      <StructuresPanel
        structures={{
          barn:        { built: true },
          chickenCoop: { built: true, eggReady: true },
        }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectEggs={noop}
      />
    );
    // Text may be split across nodes; use a function matcher
    expect(screen.getByText((content) => content.includes('Egg ready!'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collect Eggs/i })).not.toBeDisabled();
  });

  it('shows days-until-next-egg count when egg is not ready', () => {
    render(
      <StructuresPanel
        structures={{
          barn:        { built: true },
          chickenCoop: { built: true, eggReady: false, daysSinceEgg: 1 },
        }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectEggs={noop}
      />
    );
    // 2 - 1 = 1 day until next egg
    expect(screen.getByText(/1 day\(s\) until next egg/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collect Eggs/i })).toBeDisabled();
  });

  it('calls onCollectEggs when Collect Eggs button is clicked', () => {
    const onCollectEggs = jest.fn();
    render(
      <StructuresPanel
        structures={{ chickenCoop: { built: true, eggReady: true } }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectEggs={onCollectEggs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Collect Eggs/i }));
    expect(onCollectEggs).toHaveBeenCalledTimes(1);
  });

  // ── Stable ────────────────────────────────────────────────────────────────────

  it('shows "Milk ready!" and enabled Collect Milk button when milkReady', () => {
    render(
      <StructuresPanel
        structures={{
          barn:   { built: true },
          stable: { built: true, milkReady: true },
        }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectMilk={noop}
      />
    );
    expect(screen.getByText((content) => content.includes('Milk ready!'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collect Milk/i })).not.toBeDisabled();
  });

  it('shows days-until-next-milk count when milk is not ready', () => {
    render(
      <StructuresPanel
        structures={{
          barn:   { built: true },
          stable: { built: true, milkReady: false, daysSinceMilk: 1 },
        }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectMilk={noop}
      />
    );
    // 3 - 1 = 2 days until next milk
    expect(screen.getByText(/2 day\(s\) until next milk/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collect Milk/i })).toBeDisabled();
  });

  it('calls onCollectMilk when Collect Milk button is clicked', () => {
    const onCollectMilk = jest.fn();
    render(
      <StructuresPanel
        structures={{ stable: { built: true, milkReady: true } }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
        onCollectMilk={onCollectMilk}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Collect Milk/i }));
    expect(onCollectMilk).toHaveBeenCalledTimes(1);
  });

  // ── Silo ─────────────────────────────────────────────────────────────────────

  it('shows "+20% coins" passive status when silo is built', () => {
    render(
      <StructuresPanel
        structures={{ silo: { built: true } }}
        coins={0}
        onBuild={noop}
        onUseWell={noop}
        onUseCompost={noop}
      />
    );
    expect(screen.getByText(/\+20% coins on all crop sales/i)).toBeInTheDocument();
  });
});
