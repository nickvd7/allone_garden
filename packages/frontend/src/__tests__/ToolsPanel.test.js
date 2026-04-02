import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolsPanel from '../components/ToolsPanel';

describe('ToolsPanel', () => {
  const noop = jest.fn();

  it('renders all 6 tool buttons', () => {
    render(<ToolsPanel selectedTool={null} selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    ['Till Ground', 'Plant', 'Water', 'Fertilize', 'Spray Pests', 'Harvest']
      .forEach((title) => expect(screen.getByTitle(title)).toBeInTheDocument());
  });

  it('marks the active tool with the "active" class', () => {
    render(<ToolsPanel selectedTool="water" selectedSeed="tomato" onToolSelect={noop} onSeedSelect={noop} />);
    expect(screen.getByTitle('Water')).toHaveClass('active');
    expect(screen.getByTitle('Till Ground')).not.toHaveClass('active');
  });

  it('calls onToolSelect when a tool is clicked', () => {
    const onToolSelect = jest.fn();
    render(<ToolsPanel selectedTool={null} selectedSeed="tomato" onToolSelect={onToolSelect} onSeedSelect={noop} />);
    fireEvent.click(screen.getByTitle('Harvest'));
    expect(onToolSelect).toHaveBeenCalledWith('harvest');
  });

  it('clicking the active tool deselects it (passes null)', () => {
    const onToolSelect = jest.fn();
    render(<ToolsPanel selectedTool="water" selectedSeed="tomato" onToolSelect={onToolSelect} onSeedSelect={noop} />);
    fireEvent.click(screen.getByTitle('Water'));
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
    ['Tomato', 'Carrot', 'Lettuce', 'Radish', 'Corn', 'Potato', 'Pumpkin', 'Sunflower', 'Blueberry']
      .forEach((name) =>
        expect(screen.getByText(new RegExp(name), { selector: 'option' })).toBeInTheDocument()
      );
  });
});
