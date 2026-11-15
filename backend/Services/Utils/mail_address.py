import re

MAIL_ADDRESS_MAX_LENGTH = 255

MAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


def normalize_mail(mail_addr: str) -> str:
    """
    The one stored and compared form of an email address: no surrounding whitespace, lower case.

    Every place that stores an address or looks an account up by one passes it through here.
    The domain part is case-insensitive by standard and every mailbox provider this app mails
    treats the local part the same way, so "Name@Gmail.com" and "name@gmail.com" are one account.
    """
    return mail_addr.strip().lower()


def is_valid_mail(mail_addr: str) -> bool:
    """Whether an already-normalised address has a plausible shape and fits the column."""
    return len(mail_addr) <= MAIL_ADDRESS_MAX_LENGTH and MAIL_PATTERN.match(mail_addr) is not None
