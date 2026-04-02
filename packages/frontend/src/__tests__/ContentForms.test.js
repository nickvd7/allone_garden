/**
 * Tests — ContentForms
 *
 * Covers:
 *  - BLANK factories return correct shapes
 *  - PlantForm renders fields + companion CRUD
 *  - StructureForm renders fields
 *  - ToolForm renders fields
 *  - WeatherForm renders fields
 *  - ItemForm dispatches to correct sub-form by type
 */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BLANK, ItemForm, PlantForm, StructureForm, ToolForm, WeatherForm,
  blankPlant, blankStructure, blankTool, blankWeather,
} from '../components/ContentForms';

// ── Blank factories ───────────────────────────────────────────────────────────
describe('ContentForms — BLANK factories', () => {
  it('blankPlant has required fields', () => {
    const p = blankPlant();
    expect(p).toMatchObject({ slug: '', name: '', growthDays: expect.any(Number), baseCoins: expect.any(Number) });
    expect(Array.isArray(p.companionGood)).toBe(true);
    expect(Array.isArray(p.companionBad)).toBe(true);
  });

  it('blankStructure has required fields', () => {
    const s = blankStructure();
    expect(s).toMatchObject({ id: '', name: '', buildCost: expect.any(Number) });
  });

  it('blankTool has required fields', () => {
    const t = blankTool();
    expect(t).toMatchObject({ id: '', name: '' });
  });

  it('blankWeather has required fields', () => {
    const w = blankWeather();
    expect(w).toMatchObject({ id: '', name: '', waterBonus: expect.any(Number) });
  });

  it('BLANK.plants() === blankPlant()', () => {
    expect(BLANK.plants()).toEqual(blankPlant());
  });
});

// ── PlantForm ─────────────────────────────────────────────────────────────────
function PlantWrapper({ initial }) {
  const [item, setItem] = useState(initial || blankPlant());
  return <PlantForm item={item} onChange={setItem} />;
}

describe('ContentForms — PlantForm', () => {
  it('renders slug and name inputs', () => {
    render(<PlantWrapper />);
    expect(screen.getByPlaceholderText(/e\.g\. strawberry/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/^strawberry$/i)).toBeInTheDocument();
  });

  it('renders growthDays and baseCoins number inputs', () => {
    render(<PlantWrapper />);
    // both are type=number; confirm by label text
    expect(screen.getByText(/growth days/i)).toBeInTheDocument();
    expect(screen.getByText(/base coins/i)).toBeInTheDocument();
  });

  it('renders Add companion good button', () => {
    render(<PlantWrapper />);
    // Two "+ Add" buttons exist (companionGood and companionBad)
    expect(screen.getAllByText(/\+ add/i).length).toBeGreaterThanOrEqual(1);
  });

  it('adds a companion good entry on button click', () => {
    render(<PlantWrapper />);
    const addBtns = screen.getAllByText(/\+ add/i);
    fireEvent.click(addBtns[0]);
    // A slug input appears for the companion
    expect(screen.getByPlaceholderText(/slug/i)).toBeInTheDocument();
  });

  it('removes a companion good entry', () => {
    const initial = { ...blankPlant(), companionGood: [{ slug: 'carrot', bonus: 5 }] };
    render(<PlantWrapper initial={initial} />);
    expect(screen.getByDisplayValue('carrot')).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByDisplayValue('carrot')).not.toBeInTheDocument();
  });
});

// ── StructureForm ─────────────────────────────────────────────────────────────
function StructureWrapper({ initial }) {
  const [item, setItem] = useState(initial || blankStructure());
  return <StructureForm item={item} onChange={setItem} />;
}

describe('ContentForms — StructureForm', () => {
  it('renders id and name inputs', () => {
    render(<StructureWrapper />);
    expect(screen.getByPlaceholderText('windmill')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Windmill')).toBeInTheDocument();
  });

  it('renders build cost input', () => {
    render(<StructureWrapper />);
    expect(screen.getByText(/build cost/i)).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    render(<StructureWrapper />);
    expect(screen.getByText(/description/i)).toBeInTheDocument();
  });
});

// ── ToolForm ──────────────────────────────────────────────────────────────────
function ToolWrapper({ initial }) {
  const [item, setItem] = useState(initial || blankTool());
  return <ToolForm item={item} onChange={setItem} />;
}

describe('ContentForms — ToolForm', () => {
  it('renders id and name inputs', () => {
    render(<ToolWrapper />);
    expect(screen.getByPlaceholderText('shears')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Shears')).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    render(<ToolWrapper />);
    expect(screen.getByText(/description/i)).toBeInTheDocument();
  });
});

// ── WeatherForm ───────────────────────────────────────────────────────────────
function WeatherWrapper({ initial }) {
  const [item, setItem] = useState(initial || blankWeather());
  return <WeatherForm item={item} onChange={setItem} />;
}

describe('ContentForms — WeatherForm', () => {
  it('renders id and name inputs', () => {
    render(<WeatherWrapper />);
    expect(screen.getByPlaceholderText('heatwave')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Heat Wave')).toBeInTheDocument();
  });

  it('renders water bonus and pest chance inputs', () => {
    render(<WeatherWrapper />);
    expect(screen.getByText(/water bonus/i)).toBeInTheDocument();
    expect(screen.getByText(/pest chance/i)).toBeInTheDocument();
  });

  it('renders storm rollback select', () => {
    render(<WeatherWrapper />);
    // stormRollback uses a <select> (yes/no), not a checkbox
    expect(screen.getByText(/storm rollback/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});

// ── ItemForm dispatcher ───────────────────────────────────────────────────────
describe('ContentForms — ItemForm', () => {
  it('renders PlantForm for type=plants', () => {
    render(<ItemForm type="plants" item={blankPlant()} onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/e\.g\. strawberry/i)).toBeInTheDocument();
  });

  it('renders StructureForm for type=structures', () => {
    render(<ItemForm type="structures" item={blankStructure()} onChange={() => {}} />);
    expect(screen.getByPlaceholderText('windmill')).toBeInTheDocument();
  });

  it('renders ToolForm for type=tools', () => {
    render(<ItemForm type="tools" item={blankTool()} onChange={() => {}} />);
    expect(screen.getByPlaceholderText('shears')).toBeInTheDocument();
  });

  it('renders WeatherForm for type=weather', () => {
    render(<ItemForm type="weather" item={blankWeather()} onChange={() => {}} />);
    expect(screen.getByPlaceholderText('heatwave')).toBeInTheDocument();
  });
});
