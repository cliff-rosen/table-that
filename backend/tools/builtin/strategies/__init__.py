"""
Strategy Registry

Auto-imports all strategy modules and provides a registry for looking up
strategies by name.
"""

from typing import Dict, List, Optional
from tools.builtin.strategies.base import RowStrategy

_strategy_registry: Dict[str, RowStrategy] = {}


def register_strategy(strategy: RowStrategy) -> None:
    """Register a strategy instance in the global registry."""
    _strategy_registry[strategy.name] = strategy


def get_strategy(name: str) -> Optional[RowStrategy]:
    """Look up a strategy by name."""
    return _strategy_registry.get(name)


def get_all_strategies() -> Dict[str, RowStrategy]:
    """Return all registered strategies."""
    return dict(_strategy_registry)


def get_strategies_by_kind(kind: str) -> List[RowStrategy]:
    """Return all strategies of a given kind ('enrichment' or 'action')."""
    return [s for s in _strategy_registry.values() if s.kind == kind]


# Auto-import strategy modules to trigger registration
from tools.builtin.strategies import lookup        # noqa: E402, F401
from tools.builtin.strategies import research      # noqa: E402, F401
from tools.builtin.strategies import computation   # noqa: E402, F401
