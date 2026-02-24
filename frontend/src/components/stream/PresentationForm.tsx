import { useState } from 'react';
import { Category } from '../../types';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon, Bars3Icon } from '@heroicons/react/24/outline';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PresentationFormProps {
    categories: Category[];
    onChange: (updated: Category[]) => void;
}

interface SortableCategoryItemProps {
    category: Category;
    index: number;
    isExpanded: boolean;
    onToggleExpanded: () => void;
    onNameChange: (value: string) => void;
    onInclusionsChange: (value: string) => void;
    onRemove: () => void;
    canDelete: boolean;
}

function SortableCategoryItem({
    category,
    index,
    isExpanded,
    onToggleExpanded,
    onNameChange,
    onInclusionsChange,
    onRemove,
    canDelete,
}: SortableCategoryItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: category.id || `category-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const hasInclusions = category.specific_inclusions.filter(s => s.trim()).length > 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`border border-gray-300 dark:border-gray-600 rounded-lg p-3 bg-white dark:bg-gray-800 ${isDragging ? 'shadow-lg' : ''}`}
        >
            {/* Category header row */}
            <div className="flex items-center gap-3">
                {/* Drag handle */}
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-grab active:cursor-grabbing transition-colors"
                    title="Drag to reorder"
                >
                    <Bars3Icon className="h-4 w-4 text-gray-400" />
                </button>

                {/* Expand/collapse button */}
                <button
                    type="button"
                    onClick={onToggleExpanded}
                    className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                    {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                    )}
                </button>

                {/* Category name input */}
                <input
                    type="text"
                    placeholder="Category name"
                    value={category.name}
                    onChange={(e) => onNameChange(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    required
                />

                {/* Inclusion count badge */}
                {hasInclusions && !isExpanded && (
                    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {category.specific_inclusions.filter(s => s.trim()).length} criteria
                    </span>
                )}

                {/* Delete button */}
                {canDelete && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* ID display */}
            {category.id && (
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-16 mt-1">
                    ID: {category.id}
                </p>
            )}

            {/* Expanded content - Inclusion Criteria */}
            {isExpanded && (
                <div className="mt-3 ml-16">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Inclusion Criteria
                    </label>
                    <textarea
                        placeholder="What articles belong in this category (one criterion per line)"
                        rows={4}
                        value={category.specific_inclusions.join('\n')}
                        onChange={(e) => onInclusionsChange(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                </div>
            )}
        </div>
    );
}

export default function PresentationForm({ categories, onChange }: PresentationFormProps) {
    // Track which categories have expanded inclusion criteria
    const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const toggleExpanded = (index: number) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const addCategory = () => {
        onChange([
            ...categories,
            {
                id: '',
                name: '',
                topics: [],
                specific_inclusions: []
            }
        ]);
    };

    const removeCategory = (index: number) => {
        if (categories.length === 1) {
            alert('At least one category is required');
            return;
        }
        onChange(categories.filter((_, i) => i !== index));
    };

    const updateCategory = (index: number, field: keyof Category, value: any) => {
        const updated = [...categories];
        updated[index] = { ...updated[index], [field]: value };
        onChange(updated);
    };

    const handleSpecificInclusionsChange = (index: number, value: string) => {
        // Don't trim during editing - preserve user input including spaces
        const inclusions = value.split('\n');
        updateCategory(index, 'specific_inclusions', inclusions);
    };

    const generateCategoryId = (name: string): string => {
        return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    const handleCategoryNameChange = (index: number, value: string) => {
        const updated = [...categories];
        updated[index] = {
            ...updated[index],
            name: value,
            id: generateCategoryId(value)
        };
        onChange(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = categories.findIndex(
                (cat, idx) => (cat.id || `category-${idx}`) === active.id
            );
            const newIndex = categories.findIndex(
                (cat, idx) => (cat.id || `category-${idx}`) === over.id
            );

            if (oldIndex !== -1 && newIndex !== -1) {
                const reordered = arrayMove(categories, oldIndex, newIndex);
                onChange(reordered);

                // Update expanded categories indices
                setExpandedCategories(prev => {
                    const next = new Set<number>();
                    prev.forEach(idx => {
                        if (idx === oldIndex) {
                            next.add(newIndex);
                        } else if (oldIndex < newIndex) {
                            // Item moved down
                            if (idx > oldIndex && idx <= newIndex) {
                                next.add(idx - 1);
                            } else {
                                next.add(idx);
                            }
                        } else {
                            // Item moved up
                            if (idx >= newIndex && idx < oldIndex) {
                                next.add(idx + 1);
                            } else {
                                next.add(idx);
                            }
                        }
                    });
                    return next;
                });
            }
        }
    };

    // Generate sortable IDs for categories
    const sortableIds = categories.map((cat, idx) => cat.id || `category-${idx}`);

    return (
        <div className="space-y-3">
            {/* Categories Header */}
            <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Presentation Categories
                </label>
                <button
                    type="button"
                    onClick={addCategory}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                    Add Category
                </button>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                        {categories.map((category, index) => (
                            <SortableCategoryItem
                                key={category.id || `category-${index}`}
                                category={category}
                                index={index}
                                isExpanded={expandedCategories.has(index)}
                                onToggleExpanded={() => toggleExpanded(index)}
                                onNameChange={(value) => handleCategoryNameChange(index, value)}
                                onInclusionsChange={(value) => handleSpecificInclusionsChange(index, value)}
                                onRemove={() => removeCategory(index)}
                                canDelete={categories.length > 1}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}
