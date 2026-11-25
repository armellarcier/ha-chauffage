"""The rules of Chauffage don't depend on Home Assistant: the domain imports nothing from it.

The domain is `domain/`, the validation of the input (`storage/schema.py`), and until the rewrite
moves them there, `engine.py`, `model.py` and `const.py`. A domain module imports only the
standard library and other domain modules.
"""

import ast
from pathlib import Path

import pytest

PACKAGE = Path(__file__).parents[2] / "custom_components" / "chauffage"
DOMAIN_MODULES = sorted({PACKAGE / "engine.py", PACKAGE / "model.py", PACKAGE / "const.py",
                         PACKAGE / "storage" / "__init__.py", PACKAGE / "storage" / "schema.py",
                         *(PACKAGE / "domain").rglob("*.py")})


def imports_of(module: Path) -> list[tuple[str, Path | None]]:
    """(name as written, the file of a relative import, or None for an absolute one)."""
    found = []
    for node in ast.walk(ast.parse(module.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found += [(alias.name, None) for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            found.append((node.module, None))
        elif isinstance(node, ast.ImportFrom):
            base = module.parents[node.level - 1]
            names = [node.module] if node.module else [alias.name for alias in node.names]
            found += [("." * node.level + name, base.joinpath(*name.split("."))) for name in names]
    return found


def domain_file(path: Path) -> bool:
    return path.with_suffix(".py") in DOMAIN_MODULES or (path / "__init__.py") in DOMAIN_MODULES


@pytest.mark.parametrize("module", DOMAIN_MODULES, ids=lambda m: m.relative_to(PACKAGE).as_posix())
def test_the_domain_imports_nothing_from_home_assistant(module: Path):
    for name, path in imports_of(module):
        if path is None:
            assert not name.startswith(("homeassistant", "custom_components")), f"{module.name} imports {name}"
        else:
            assert domain_file(path), f"{module.name} imports {name}, which is not in the domain"


def test_the_check_sees_an_import_of_home_assistant(tmp_path: Path):
    module = tmp_path / "rule.py"
    module.write_text("from homeassistant.core import HomeAssistant\nfrom .runtime import ChauffageRuntime\n")
    assert imports_of(module) == [("homeassistant.core", None), (".runtime", tmp_path / "runtime")]
    assert not domain_file(PACKAGE / "runtime")
    assert domain_file(PACKAGE / "engine")
