import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolsPanel from '../components/ToolsPanel';

describe('ToolsPanel', () => {
  const noop = jest.fn();

  it('renders all 6 tool buttons', () => {
    render(<ToolsPanel selectedTool={null} selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    // Each button has title={t(labelKey)} — the mock returns the key itself
    ['tool_till', 'tool_plant', 'tool_water', 'tool_fertilize', 'tool_spray', 'tool_harvest']
      .forEach((key) => expect(screen.getByTitle(key)).toBeInTheDocument());
  });

  it('marks the active tool with the "active" class', () => {
    render(<ToolsPanel selectedTool="water" selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    expect(screen.getByTitle('tool_water')).toHaveClass('active');
    expect(screen.getByTitle('tool_till')).not.toHaveClass('active');
  });

  it('calls onToolSelect when a tool is clicked', () => {
    const onToolSelect = jest.fn();
    render(<ToolsPanel selectedTool={null} selectedSeed="tomato" onToolSelect={onToolSelect} onSeedSelect={noop} />);
    fireEvent.click(screen.getByTitle('tool_harvest'));
    expect(onToolSelect).toHaveBeenCalledWith('harvest');
  });

  it('clicking the active tool deselects it (passes null)', () => {
    const onToolSelect = jest.fn();
    render(<ToolsPanel selectedTool="water" selectedSeed="tomato" onToolSelect={onToolSelect} onSeedSelect={noop} />);
    fireEvent.click(screen.getByTitle('tool_water'));
    expect(onToolSelect).toHaveBeenCalledWith(null);
  });

  it('seed dropdown is disabled unless plant tool is selected', () => {
    const { rerender } = render(
      <ToolsPanel selectedTool={null} selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();

    rerender(<ToolsPanel selectedTool="plant" selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('calls onSeedSelect when seed dropdown changes', () => {
    const onSeedSelect = jest.fn();
    render(<ToolsPanel selectedTool="plant" selectedSeed="tomato" onToolSelect={noop} onSeedSelect={onSeedSelect} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'carrot' } });
    expect(onSeedSelect).toHaveBeenCalledWith('carrot');
  });

  it('renders all 9 seed options', () => {
    render(<ToolsPanel selectedTool="plant" selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    // Options render as "{emoji} {labelKey} ({days}d)" — match by key via regex
    ['plant_tomato','plant_carrot','plant_lettuce','plant_radish','plant_corn',
     'plant_potato','plant_pumpkin','plant_sunflower','plant_blueberry']
      .forEach((key) =>
        expect(screen.getByText(new RegExp(key), { selector: 'option' })).toBeInTheDocument()
      );
  });
});
