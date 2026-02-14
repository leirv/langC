ACT {
    Create
    Update
}

TYPE{
    API,
    METHOD,
    FNC
}
LNG=python
INST {
    CMD {
        [TYPE]
    }
}


INST=CMD.CREATE(TYPE.FNC, TYPE.METHOD)

### EXPECTED OUTCOME
- Claude will create a set of instructions into the claude .md file.
- That wil be either sub agents, teams tasks, skills, commands to follow.