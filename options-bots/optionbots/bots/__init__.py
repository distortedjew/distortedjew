from .atlas import Atlas
from .nova import Nova
from .orchard import Orchard
from .ranger import Ranger
from .volt import Volt

BOTS = {cls.name: cls for cls in (Atlas, Nova, Ranger, Volt, Orchard)}
